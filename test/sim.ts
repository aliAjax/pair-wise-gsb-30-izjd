/* 端到端模拟：断网派车 → 抢占 → 回传对账 → 半份失败 → 恢复 → 库存重算 */
import { createPinia, setActivePinia } from "pinia";
import { useDispatchStore } from "../src/store";

// --- 最小浏览器环境垫片 ---
const memStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
};
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => `u-${Math.random().toString(36).slice(2, 10)}` },
  });
}
(globalThis as any).window = { setTimeout: globalThis.setTimeout };

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${msg}`);
  }
}

setActivePinia(createPinia());
const store = useDispatchStore();

console.log("1) 初始种子状态");
assert(store.orders.length === 3, "3 张种子配送单");
assert(store.trucks.every((t) => !t.orderId || ["truck-1", "truck-2"].includes(t.id)), "罐车占用符合预期");
assert(store.gapOrders.some((o) => o.id === "order-2"), "机场站柴油缺口单被列出");
assert(store.pendingReviews.some((r) => r.kind === "车辆抢占"), "种子含 1 笔车辆抢占待复核");

console.log("2) 在线拉取油库结果：种子抢占按首次确认时间裁决（本单 07:35 早于对方 07:38 → 本单胜）");
store.pullDepotAndReconcile();
const o3 = store.orders.find((o) => o.id === "order-3")!;
assert(o3.truckId === "truck-1", "本单在先 → 保住罐车");
assert(o3.dirtyTicketIds.length === 0, "派车领号已回传");
assert(store.pendingReviews.length === 0, "待复核清零");

console.log("3) 断网派车 + 模拟抢占（对方在先 → 输方回滚，回退待派车）");
store.setOnline(false);
store.createOrder({ station: "新区站", fuel: "92号汽油", tons: 5 });
const newOrder = store.orders[0];
store.assignTruck(newOrder.id, "truck-3");
const loser = store.orders.find((o) => o.id === newOrder.id)!;
assert(loser.stage === "待装车" && loser.truckId === "truck-3", "断网派车成功，本地先落账");
assert(loser.dirtyTicketIds.length >= 1, "断网领号进入待回传队列");
store.simulateTruckConflict(newOrder.id);
store.setOnline(true);
const conflictReview = store.pendingReviews.find((r) => r.orderId === newOrder.id && r.kind === "车辆抢占")!;
store.pullDepotAndReconcile();
const loserAfter = store.orders.find((o) => o.id === newOrder.id)!;
assert(loserAfter.stage === "待派车" && loserAfter.truckId === null, "抢占输方回滚到待派车、释放罐车");
const t3 = store.trucks.find((t) => t.id === "truck-3")!;
assert(t3.status === "空闲" && t3.orderId === null, "罐车已释放为空闲");
assert(!store.pendingReviews.some((r) => r.id === conflictReview.id), "抢占记录已对账");

console.log("4) 半份装车失败 → 从最近完整领号恢复（派车领号）");
store.assignTruck(newOrder.id, "truck-3");
const reorder = store.orders.find((o) => o.id === newOrder.id)!;
const stockBefore = store.stockOf("新区站", "92号汽油");
store.submitLoad(newOrder.id, 3, true); // 失败：落账半份 3 吨
const stockAfterHalf = store.stockOf("新区站", "92号汽油");
assert(Math.abs(stockAfterHalf - (stockBefore - 3)) < 1e-9, "半份 3 吨已从油库库存扣除");
assert(reorder.loadedTons === 3 && reorder.stage === "装车中", "单据停在装车中，已装车 3 吨");
const halfReview = store.pendingReviews.find((r) => r.orderId === newOrder.id && r.kind === "半份恢复")!;
assert(!!halfReview, "生成半份恢复待复核记录");
store.recoverHalfLoad(halfReview.id);
const stockAfterRecover = store.stockOf("新区站", "92号汽油");
assert(Math.abs(stockAfterRecover - stockBefore) < 1e-9, "恢复后半份吨数回补库存");
assert(reorder.loadedTons === 0 && reorder.stage === "待装车", "单据回滚到待装车（派车领号之后）");
assert(reorder.claimTicketId !== null, "派车首次确认领号仍保留（最近完整领号）");

console.log("5) 恢复后续办：完整装车 → 发车沿用首次确认 → 到站验收");
store.submitLoad(newOrder.id, 5, false);
assert(reorder.loadedTons === 5 && reorder.stage === "待发车", "补装完成，进入待发车");
store.depart(newOrder.id);
assert(reorder.stage === "已发车", "已发车");
const departTk = store.tickets.find((t) => t.id === reorder.departTicketId)!;
assert(departTk.basisTicketId === reorder.claimTicketId, "发车领号沿用派车首次确认依据");
const stationStockBeforeArrive = store.stockOf("新区站", "92号汽油");
store.arrive(newOrder.id, 5);
assert(reorder.stage === "已到站", "已到站");
assert(
  Math.abs(store.stockOf("新区站", "92号汽油") - (stationStockBeforeArrive + 5)) < 1e-9,
  "验收 5 吨入站库存",
);

console.log("6) 到站验收差异：库存以油库验收为准，差异挂待复核");
store.createOrder({ station: "机场站", fuel: "柴油", tons: 4 });
const dOrder = store.orders.find((o) => o.station === "机场站" && o.fuel === "柴油" && o.tons === 4)!;
store.assignTruck(dOrder.id, "truck-3");
store.submitLoad(dOrder.id, 4, false);
store.depart(dOrder.id);
const arriveStockBefore = store.stockOf("机场站", "柴油");
store.arrive(dOrder.id, 3); // 实收少 1 吨
assert(
  Math.abs(store.stockOf("机场站", "柴油") - (arriveStockBefore + 3)) < 1e-9,
  "差异时库存按油库实收 3 吨入账",
);
assert(store.pendingReviews.some((r) => r.orderId === dOrder.id && r.kind === "验收待对"), "差异列入待复核");

console.log("7) 库存一变：未装车占用按新库存重算，缺口列表更新");
const o2 = store.orders.find((o) => o.id === "order-2")!;
const gapBefore = o2.shortTons;
const pool = store.stockOf("机场站", "柴油");
assert(gapBefore === Math.max(0, 12 - pool), `机场柴油缺口 = 12 - 库存${pool} = ${gapBefore}`);
store.adjustStock("机场站", "柴油", 5, "油库补验收");
const o2b = store.orders.find((o) => o.id === "order-2")!;
assert(o2b.shortTons === 0 && o2b.reservedTons === 12, "补库 5 吨后缺口清零、占用恢复 12");
assert(!store.gapOrders.some((o) => o.id === "order-2"), "缺口清单移除该单");
store.adjustStock("机场站", "柴油", -8, "紧急调出");
const o2c = store.orders.find((o) => o.id === "order-2")!;
assert(o2c.shortTons > 0, "库存下调后缺口重新出现");
assert(store.gapOrders.some((o) => o.id === "order-2"), "缺口清单重新列出");

console.log("8) 已发车单据抢占保护：沿用首次确认依据，罐车不释放");
const o1 = store.orders.find((o) => o.id === "order-1")!;
assert(o1.stage === "已发车", "order-1 已发车");
store.simulateTruckConflict(o1.id);
store.pullDepotAndReconcile();
const o1b = store.orders.find((o) => o.id === "order-1")!;
assert(o1b.truckId === "truck-2" && o1b.stage === "已发车", "已发车单即使对方在先也继续占用罐车");
const rev = store.resolvedReviews.find((r) => r.orderId === "order-1");
assert(!!rev && rev.resolution.includes("沿用首次确认"), "对账结论写明沿用首次确认依据");

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail) process.exit(1);
