import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import {
  FUELS,
  STATIONS,
  type DeliveryOrder,
  type DepotResult,
  type Fuel,
  type InventoryItem,
  type OpKind,
  type ReviewKind,
  type Station,
  type TabletReview,
  type Ticket,
  type Toast,
  type Truck,
} from "./types";

const STORAGE_KEY = "hxwlfront-19-flood-dispatch-v1";

interface PersistShape {
  orders: DeliveryOrder[];
  trucks: Truck[];
  inventory: InventoryItem[];
  tickets: Ticket[];
  reviews: TabletReview[];
  seq: number;
}

// ---------------------------------------------------------------- 种子数据

const T0 = "2026-10-02T08:00:00.000Z";

function seed(): PersistShape {
  const trucks: Truck[] = [
    { id: "truck-1", plate: "陕A·G0001", capacity: 20, fuel: null, loadedTons: 0, status: "空闲", orderId: null },
    { id: "truck-2", plate: "陕A·G0002", capacity: 15, fuel: null, loadedTons: 0, status: "空闲", orderId: null },
    { id: "truck-3", plate: "陕A·G0003", capacity: 12, fuel: null, loadedTons: 0, status: "空闲", orderId: null },
  ];

  const inventory: InventoryItem[] = [];
  const stockTable: Record<Station, Record<Fuel, number>> = {
    城东站: { "92号汽油": 22, "95号汽油": 25, 柴油: 30 },
    机场站: { "92号汽油": 8, "95号汽油": 20, 柴油: 10 },
    新区站: { "92号汽油": 6, "95号汽油": 12, 柴油: 14 },
  };
  for (const station of STATIONS) {
    for (const fuel of FUELS) inventory.push({ station, fuel, stock: stockTable[station][fuel] });
  }

  const orders: DeliveryOrder[] = [
    {
      id: "order-1",
      code: "PSD-20261002-01",
      station: "城东站",
      fuel: "92号汽油",
      tons: 18,
      stage: "已发车",
      loadedTons: 18,
      truckId: "truck-2",
      claimTicketId: "tk-1002",
      firstConfirmAt: "2026-10-02T06:40:00.000Z",
      loadTicketIds: ["tk-1003"],
      departTicketId: "tk-1004",
      arriveTicketId: null,
      dirtyTicketIds: [],
      reservedTons: 0,
      shortTons: 0,
      createdAt: "2026-10-02T06:30:00.000Z",
    },
    {
      id: "order-2",
      code: "PSD-20261002-02",
      station: "机场站",
      fuel: "柴油",
      tons: 12,
      stage: "待派车",
      loadedTons: 0,
      truckId: null,
      claimTicketId: null,
      firstConfirmAt: null,
      loadTicketIds: [],
      departTicketId: null,
      arriveTicketId: null,
      dirtyTicketIds: [],
      reservedTons: 10,
      shortTons: 2,
      createdAt: "2026-10-02T07:20:00.000Z",
    },
    {
      id: "order-3",
      code: "PSD-20261002-03",
      station: "新区站",
      fuel: "92号汽油",
      tons: 10,
      stage: "待装车",
      loadedTons: 0,
      truckId: "truck-1",
      claimTicketId: "tk-2001",
      firstConfirmAt: "2026-10-02T07:35:00.000Z",
      loadTicketIds: [],
      departTicketId: null,
      arriveTicketId: null,
      dirtyTicketIds: ["tk-2001"],
      reservedTons: 6,
      shortTons: 4,
      createdAt: "2026-10-02T07:10:00.000Z",
    },
  ];

  const tickets: Ticket[] = [
    {
      id: "tk-1001", seq: 1, kind: "建单", at: "2026-10-02T06:30:00.000Z", offline: false,
      complete: true, synced: true, needsRedo: false, orderId: "order-1", station: "城东站",
      fuel: "92号汽油", tons: 18, note: "城东站 92号汽油 18 吨",
    },
    {
      id: "tk-1002", seq: 2, kind: "派车", at: "2026-10-02T06:40:00.000Z", offline: false,
      complete: true, synced: true, needsRedo: false, orderId: "order-1", truckId: "truck-2",
      note: "派车 陕A·G0002（首次确认依据）",
    },
    {
      id: "tk-1003", seq: 3, kind: "装车", at: "2026-10-02T06:55:00.000Z", offline: false,
      complete: true, synced: true, needsRedo: false, orderId: "order-1", truckId: "truck-2",
      station: "城东站", fuel: "92号汽油", tons: 18, note: "装车 18 吨，油库验收通过",
      depot: {
        accepted: true, acceptedTons: 18, stockAfter: 22,
        message: "油库验收：实收 18 吨", receivedAt: "2026-10-02T06:58:00.000Z",
      },
    },
    {
      id: "tk-1004", seq: 4, kind: "发车", at: "2026-10-02T07:05:00.000Z", offline: false,
      complete: true, synced: true, needsRedo: false, orderId: "order-1", truckId: "truck-2",
      basisTicketId: "tk-1002", note: "发车，沿用首次确认领号 tk-1002",
    },
    {
      id: "tk-2001", seq: 5, kind: "派车", at: "2026-10-02T07:35:00.000Z", offline: true,
      complete: true, synced: false, needsRedo: false, orderId: "order-3", truckId: "truck-1",
      note: "断网派车 陕A·G0001，回网待回传",
    },
  ];

  const reviews: TabletReview[] = [
    {
      id: "rev-seed-1",
      at: "2026-10-02T07:40:00.000Z",
      kind: "车辆抢占",
      orderId: "order-3",
      truckId: "truck-1",
      ticketId: "tk-2001",
      competitorAt: "2026-10-02T07:38:00.000Z",
      message: "平板现场记录：陕A·G0001 疑似被另一张单据重复领号（对方 07:38），回网后需拉取油库验收结果对账",
      status: "待复核",
    },
  ];

  return { orders, trucks, inventory, tickets, reviews, seq: 5 };
}

function load(): PersistShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as PersistShape;
    } catch {
      // 落入种子
    }
  }
  return seed();
}

// ---------------------------------------------------------------- store

export const useDispatchStore = defineStore("flood-dispatch", () => {
  const initial = load();
  const orders = reactive<DeliveryOrder[]>(initial.orders);
  const trucks = reactive<Truck[]>(initial.trucks);
  const inventory = reactive<InventoryItem[]>(initial.inventory);
  const tickets = reactive<Ticket[]>(initial.tickets);
  const reviews = reactive<TabletReview[]>(initial.reviews);
  const seq = ref(initial.seq);
  const online = ref(true);
  const toasts = reactive<Toast[]>([]);

  // ------------------------------ 基础工具 ------------------------------

  function toast(type: Toast["type"], text: string) {
    const item: Toast = { id: crypto.randomUUID(), type, text };
    toasts.push(item);
    window.setTimeout(() => {
      const i = toasts.findIndex((t) => t.id === item.id);
      if (i >= 0) toasts.splice(i, 1);
    }, 4200);
  }

  function persist() {
    const data: PersistShape = {
      orders: JSON.parse(JSON.stringify(orders)),
      trucks: JSON.parse(JSON.stringify(trucks)),
      inventory: JSON.parse(JSON.stringify(inventory)),
      tickets: JSON.parse(JSON.stringify(tickets)),
      reviews: JSON.parse(JSON.stringify(reviews)),
      seq: seq.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function nextTicketId() {
    seq.value += 1;
    return `tk-${String(seq.value).padStart(4, "0")}`;
  }

  function getOrder(id: string) {
    return orders.find((o) => o.id === id);
  }

  function getTruck(id: string | null | undefined) {
    return trucks.find((t) => t.id === id);
  }

  function stockOf(station: Station, fuel: Fuel) {
    return inventory.find((i) => i.station === station && i.fuel === fuel)?.stock ?? 0;
  }

  function setStock(station: Station, fuel: Fuel, value: number) {
    const item = inventory.find((i) => i.station === station && i.fuel === fuel);
    if (item) item.stock = Math.max(0, Math.round(value * 100) / 100);
  }

  function addReview(kind: ReviewKind, message: string, extra: Partial<TabletReview> = {}) {
    reviews.unshift({
      id: crypto.randomUUID(),
      at: nowIso(),
      kind,
      message,
      status: "待复核",
      ...extra,
    });
  }

  /** 领号：任何现场操作都先领号，断网则进 dirty 队列待回传 */
  function issueTicket(kind: OpKind, note: string, extra: Partial<Ticket> = {}): Ticket {
    const ticket: Ticket = {
      id: nextTicketId(),
      seq: seq.value,
      kind,
      at: nowIso(),
      offline: !online.value,
      complete: true,
      synced: false,
      needsRedo: false,
      note,
      ...extra,
    };
    tickets.unshift(ticket);
    if (extra.orderId) {
      const order = getOrder(extra.orderId);
      if (order) order.dirtyTicketIds.push(ticket.id);
    }
    return ticket;
  }

  function syncTicket(ticket: Ticket) {
    ticket.synced = true;
    if (ticket.orderId) {
      const order = getOrder(ticket.orderId);
      if (order) order.dirtyTicketIds = order.dirtyTicketIds.filter((id) => id !== ticket.id);
    }
  }

  // --------------- 库存一变：未装车占用按新库存重算（FIFO） ---------------

  function recompute() {
    // 已发车/已到站不再占用油库库存；待装与装车中的单据按建单先后排队
    const pending = orders
      .filter((o) => o.stage !== "已发车" && o.stage !== "已到站")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const remain = new Map<string, number>();
    for (const item of inventory) remain.set(`${item.station}|${item.fuel}`, item.stock);

    for (const order of pending) {
      // 装车中/已部分装车：已装车数已从油库扣走，只需再占用“剩余计划量”
      const need = Math.max(0, order.tons - order.loadedTons);
      const key = `${order.station}|${order.fuel}`;
      const avail = remain.get(key) ?? 0;
      order.reservedTons = Math.min(need, avail);
      order.shortTons = Math.max(0, need - avail);
      remain.set(key, Math.max(0, avail - need));
    }
    persist();
  }

  // ------------------------------ 建单 ------------------------------

  function createOrder(input: { station: Station; fuel: Fuel; tons: number }) {
    const id = crypto.randomUUID();
    const code = `PSD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(orders.length + 1).padStart(2, "0")}`;
    const order: DeliveryOrder = {
      id,
      code,
      station: input.station,
      fuel: input.fuel,
      tons: input.tons,
      stage: "待派车",
      loadedTons: 0,
      truckId: null,
      claimTicketId: null,
      firstConfirmAt: null,
      loadTicketIds: [],
      departTicketId: null,
      arriveTicketId: null,
      dirtyTicketIds: [],
      reservedTons: 0,
      shortTons: input.tons,
      createdAt: nowIso(),
    };
    orders.unshift(order);
    const tk = issueTicket("建单", `${input.station} ${input.fuel} ${input.tons} 吨`, {
      orderId: id,
      station: input.station,
      fuel: input.fuel,
      tons: input.tons,
    });
    recompute();
    toast(tk.offline ? "warn" : "success", `已领号 ${tk.id} 建单${tk.offline ? "（断网，回网后回传）" : ""}`);
  }

  // ------------------------------ 派车（可断网） ------------------------------

  const idleTrucks = computed(() =>
    trucks.filter((t) => t.status === "空闲" || (t.orderId === null)),
  );

  function assignTruck(orderId: string, truckId: string) {
    const order = getOrder(orderId);
    const truck = getTruck(truckId);
    if (!order || !truck) return;
    if (order.stage !== "待派车") {
      toast("error", "当前阶段不能派车");
      return;
    }
    if (truck.status !== "空闲" || truck.orderId !== null) {
      toast("error", `${truck.plate} 已被占用`);
      return;
    }
    const tk = issueTicket("派车", `派车 ${truck.plate}（首次确认依据）`, {
      orderId, truckId,
    });
    order.truckId = truck.id;
    order.claimTicketId = tk.id;
    order.firstConfirmAt = tk.at;
    order.stage = "待装车";
    truck.status = "待装";
    truck.orderId = orderId;
    truck.fuel = order.fuel;
    recompute();
    toast(tk.offline ? "warn" : "success", `派车领号 ${tk.id}，罐车首次确认时间已锁定${tk.offline ? "；断网派车，回网待回传" : ""}`);
  }

  /** 模拟：回传时平板发现该罐车被另一张单在先领号抢占 */
  function simulateTruckConflict(orderId: string) {
    const order = getOrder(orderId);
    if (!order || !order.claimTicketId) {
      toast("error", "只有已派车单据才能模拟同车抢占");
      return;
    }
    const rival = new Date(Date.now() - 5 * 60000).toISOString();
    addReview("车辆抢占", `平板现场记录：${getTruck(order.truckId)?.plate} 疑似另有在先派车领号，等待拉取油库验收结果对账`, {
      orderId,
      truckId: order.truckId!,
      ticketId: order.claimTicketId,
      competitorAt: rival,
    });
    toast("warn", "已在平板登记同车抢占待复核记录");
  }

  // ------------------------------ 装车（可半份失败） ------------------------------

  function submitLoad(orderId: string, tons: number, fail: boolean) {
    const order = getOrder(orderId);
    const truck = getTruck(order?.truckId);
    if (!order || !truck) return;
    if (order.stage !== "待装车" && order.stage !== "装车中") {
      toast("error", "当前阶段不能装车");
      return;
    }
    const remain = order.tons - order.loadedTons;
    const part = Math.min(tons, remain);
    if (part <= 0) {
      toast("error", "装车吨数必须大于 0");
      return;
    }

    if (fail) {
      // —— 提交失败：油库侧已落账 part 吨（半份），本地单据停在装车中 ——
      setStock(order.station, order.fuel, stockOf(order.station, order.fuel) - part);
      order.loadedTons = Math.round((order.loadedTons + part) * 100) / 100;
      order.stage = "装车中";
      truck.loadedTons = order.loadedTons;
      const tk = issueTicket("装车", `装车提交失败：油库已落账 ${part} 吨（半份），待从最近完整领号恢复`, {
        orderId, truckId: truck.id, station: order.station, fuel: order.fuel, tons: part,
      });
      tk.complete = false;
      tk.needsRedo = true;
      tk.errorMsg = "回传中断/提交失败，装车数半份落账";
      order.loadTicketIds.push(tk.id);
      addReview("半份恢复", `装车提交失败，已落账半份 ${part} 吨；可从最近完整领号 ${order.claimTicketId} 续办补装剩余 ${remain - part} 吨`, {
        orderId, truckId: truck.id, ticketId: tk.id,
      });
      recompute();
      toast("error", `装车提交失败：半份 ${part} 吨已落账，领号 ${tk.id} 待续办`);
      return;
    }

    // —— 正常提交：油库验收按实收 ——
    const before = stockOf(order.station, order.fuel);
    if (part > before + 1e-9) {
      toast("error", `油库库存不足（剩余 ${before} 吨），请先处理缺口`);
      return;
    }
    setStock(order.station, order.fuel, before - part);
    order.loadedTons = Math.round((order.loadedTons + part) * 100) / 100;
    truck.loadedTons = order.loadedTons;
    const tk = issueTicket("装车", `装车 ${part} 吨`, {
      orderId, truckId: truck.id, station: order.station, fuel: order.fuel, tons: part,
    });
    order.loadTicketIds.push(tk.id);

    if (order.loadedTons + 1e-9 >= order.tons) {
      order.stage = "待发车";
      truck.status = "待发";
    } else {
      order.stage = "装车中";
    }
    recompute();
    toast("success", `装车领号 ${tk.id}，累计装车 ${order.loadedTons}/${order.tons} 吨`);
  }

  /** 模拟：油库实收与平板自报吨数不一致 */
  function simulateLoadDiff(orderId: string) {
    const order = getOrder(orderId);
    const lastLoadId = order?.loadTicketIds[order.loadTicketIds.length - 1];
    const tk = tickets.find((t) => t.id === lastLoadId);
    if (!order || !tk) {
      toast("error", "需要先成功提交一次装车，才能模拟装车差异");
      return;
    }
    addReview("装车差异", `平板自报 ${tk.tons} 吨，油库实收待核对`, {
      orderId, truckId: order.truckId!, ticketId: tk.id,
    });
    toast("warn", "已登记装车差异待复核记录");
  }

  /** 半份恢复：从最近完整领号（派车首次确认）续办，回滚半份装车数后重新提交 */
  function recoverHalfLoad(reviewId: string) {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review || review.kind !== "半份恢复") return;
    const order = getOrder(review.orderId!);
    const truck = getTruck(order?.truckId);
    const badTicket = tickets.find((t) => t.id === review.ticketId);
    if (!order || !truck || !badTicket) return;

    // 回滚半份：油库库存补回，单据恢复到最近完整领号（派车）之后的状态
    const half = badTicket.tons ?? 0;
    setStock(order.station, order.fuel, stockOf(order.station, order.fuel) + half);
    order.loadedTons = Math.max(0, order.loadedTons - half);
    truck.loadedTons = order.loadedTons;
    order.stage = "待装车";
    badTicket.needsRedo = false;
    badTicket.complete = false;
    badTicket.errorMsg = `已从最近完整领号 ${order.claimTicketId} 恢复，半份装车数已回滚`;
    review.status = "已对账";
    review.resolution = `按派车领号 ${order.claimTicketId}（首次确认 ${fmtTime(order.firstConfirmAt)}）续办：回滚半份 ${half} 吨，可重新提交装车`;
    recompute();
    toast("success", `已从最近完整领号 ${order.claimTicketId} 恢复，半份装车数已回滚，请重新装车`);
  }

  // ------------------------------ 发车（沿用首次确认） ------------------------------

  function depart(orderId: string) {
    const order = getOrder(orderId);
    const truck = getTruck(order?.truckId);
    if (!order || !truck) return;
    if (order.stage !== "待发车") {
      toast("error", "需装车完成（待发车）才能发车");
      return;
    }
    if (order.shortTons > 0 && order.loadedTons < order.tons) {
      toast("error", "仍有装车缺口，不能发车");
      return;
    }
    const tk = issueTicket("发车", `发车，沿用派车首次确认领号 ${order.claimTicketId}`, {
      orderId, truckId: truck.id,
    });
    tk.basisTicketId = order.claimTicketId ?? undefined;
    order.departTicketId = tk.id;
    order.stage = "已发车";
    truck.status = "在途";
    recompute();
    toast(tk.offline ? "warn" : "success", `发车领号 ${tk.id}（依据 ${order.claimTicketId}）${tk.offline ? "，断网回网后回传" : ""}`);
  }

  // ------------------------------ 到站验收 ------------------------------

  function arrive(orderId: string, acceptedTons: number) {
    const order = getOrder(orderId);
    const truck = getTruck(order?.truckId);
    if (!order || !truck) return;
    if (order.stage !== "已发车") {
      toast("error", "只有已发车单据能到站确认");
      return;
    }
    const tk = issueTicket("到站", `到站 ${order.station}，平板实收 ${acceptedTons} 吨`, {
      orderId, truckId: truck.id, station: order.station, fuel: order.fuel, tons: acceptedTons,
    });
    order.arriveTicketId = tk.id;

    if (Math.abs(acceptedTons - order.loadedTons) < 1e-9) {
      // 验收一致：到站库存按验收量增加，罐车释放
      setStock(order.station, order.fuel, stockOf(order.station, order.fuel) + acceptedTons);
      order.stage = "已到站";
      releaseTruck(truck);
      if (online.value) {
        syncTicket(tk);
        tk.depot = {
          accepted: true, acceptedTons, receivedAt: nowIso(),
          message: `油库验收通过：实收 ${acceptedTons} 吨，已入 ${order.station} 库存`,
        };
      }
      recompute();
      toast("success", `到站领号 ${tk.id}，验收一致，库存 +${acceptedTons} 吨${online.value ? "" : "（断网，验收结果回网后补登）"}`);
      return;
    }

    // 验收不一致：库存先按平板实收数暂记，回网拉取油库结果时再以验收为准
    setStock(order.station, order.fuel, stockOf(order.station, order.fuel) + acceptedTons);
    const diff = Math.round((acceptedTons - order.loadedTons) * 100) / 100;
    addReview("验收待对", `到站验收差异：装车 ${order.loadedTons} 吨 / 平板实收 ${acceptedTons} 吨（${diff > 0 ? "+" : ""}${diff}），回网按油库验收结果调账`, {
      orderId, truckId: truck.id, ticketId: tk.id,
    });
    order.stage = "已到站";
    releaseTruck(truck);
    recompute();
    toast("warn", `到站领号 ${tk.id}：实收与装车差 ${diff} 吨，已列入待复核`);
  }

  function releaseTruck(truck: Truck) {
    truck.status = "空闲";
    truck.orderId = null;
    truck.fuel = null;
    truck.loadedTons = 0;
  }

  // ------------------------------ 回传 + 对账 ------------------------------

  /** 拉取油库验收结果：未回传领号按“先到油库、后到平板”的顺序逐一对账 */
  function pullDepotAndReconcile() {
    if (!online.value) {
      toast("error", "当前断网，无法拉取油库验收结果");
      return;
    }
    const pending = [...reviews.filter((r) => r.status === "待复核")];
    const dirty = tickets.filter((t) => !t.synced && !pending.some((r) => r.ticketId === t.id));
    let handled = 0;

    for (const review of pending) {
      if (review.kind === "车辆抢占") reconcileTruckConflict(review);
      else if (review.kind === "半份恢复") reconcileHalfLoad(review);
      else if (review.kind === "装车差异") reconcileLoadDiff(review);
      else if (review.kind === "验收待对") reconcileArriveDiff(review);
      handled += 1;
    }

    // 回传顺序不一致：先到油库、后到平板的无争议领号直接补验收
    for (const tk of [...dirty].reverse()) {
      const order = tk.orderId ? getOrder(tk.orderId) : undefined;
      const depot: DepotResult = {
        accepted: true,
        acceptedTons: tk.tons,
        receivedAt: nowIso(),
        message:
          tk.kind === "派车"
            ? "油库确认派车有效（晚于平板到达，按油库验收顺序补登记）"
            : `油库验收通过：${tk.kind} ${tk.tons ?? ""} 吨`,
      };
      tk.depot = depot;
      syncTicket(tk);
      if (order) order.dirtyTicketIds = order.dirtyTicketIds.filter((id) => id !== tk.id);
      handled += 1;
    }

    recompute();
    toast(handled ? "success" : "info", handled ? `已拉取油库验收结果，完成 ${handled} 笔对账/回传` : "没有待回传或待复核记录");
  }

  /** 车辆抢占对账：油库按首次确认时间裁决，已发车单据沿用首次确认依据受保护 */
  function reconcileTruckConflict(review: TabletReview) {
    const order = getOrder(review.orderId!);
    const tk = tickets.find((t) => t.id === review.ticketId);
    if (!order || !tk) return;

    const truck = getTruck(order.truckId);
    const mine = order.firstConfirmAt ?? tk.at;
    const rival = review.competitorAt ?? new Date(Date.now() + 60000).toISOString();
    const departed = order.stage === "已发车" || order.stage === "已到站";
    const iWin = departed || mine.localeCompare(rival) <= 0;

    tk.depot = {
      accepted: iWin,
      winnerTicketId: iWin ? tk.id : undefined,
      receivedAt: nowIso(),
      message: iWin
        ? departed
          ? `油库裁决：本单已发车，沿用首次确认领号 ${tk.id}，继续有效`
          : `油库裁决：本单 ${fmtTime(mine)} 早于对方 ${fmtTime(rival)}，派车有效`
        : `油库裁决：对方领号 ${fmtTime(rival)} 早于本单 ${fmtTime(mine)}，本单让出罐车`,
    };

    if (iWin) {
      syncTicket(tk);
      review.status = "已对账";
      review.resolution = `按油库验收结果，本单首次确认在先（${fmtTime(mine)}），${truck?.plate ?? "罐车"} 归本单${departed ? "；已发车单据沿用首次确认依据，不再调整" : ""}`;
    } else {
      // 输方：回滚到派车前的最近完整状态，罐车让出，单据退回待派车重新派车
      tk.needsRedo = true;
      tk.synced = true;
      order.dirtyTicketIds = order.dirtyTicketIds.filter((id) => id !== tk.id);
      if (truck && truck.orderId === order.id) releaseTruck(truck);
      order.truckId = null;
      order.claimTicketId = null;
      order.firstConfirmAt = null;
      order.stage = "待派车";
      review.status = "已对账";
      review.resolution = `按油库验收结果让出罐车（对方 ${fmtTime(rival)} 在先），已退回待派车，可重新派车续办`;
    }
  }

  function reconcileHalfLoad(review: TabletReview) {
    // 无油库补验收信息时，按最近完整领号自动恢复
    recoverHalfLoad(review.id);
  }

  function reconcileLoadDiff(review: TabletReview) {
    const tk = tickets.find((t) => t.id === review.ticketId);
    if (!tk) return;
    const depotTons = Math.max(0, (tk.tons ?? 0) - 1);
    tk.depot = {
      accepted: true,
      acceptedTons: depotTons,
      receivedAt: nowIso(),
      message: `油库实收 ${depotTons} 吨，平板自报 ${tk.tons} 吨，以油库验收为准`,
    };
    const order = tk.orderId ? getOrder(tk.orderId) : undefined;
    if (order) {
      const diff = Math.round((depotTons - (tk.tons ?? 0)) * 100) / 100;
      setStock(order.station, order.fuel, stockOf(order.station, order.fuel) - diff);
    }
    syncTicket(tk);
    review.status = "已对账";
    review.resolution = `按油库验收结果修正为 ${depotTons} 吨，库存差额 ${depotTons - (tk.tons ?? 0)} 吨已调平`;
    toast("info", `装车差异已按油库实收 ${depotTons} 吨调平`);
  }

  function reconcileArriveDiff(review: TabletReview) {
    const tk = tickets.find((t) => t.id === review.ticketId);
    if (tk) {
      tk.depot = {
        accepted: true,
        acceptedTons: tk.tons,
        receivedAt: nowIso(),
        message: `油库验收确认实收 ${tk.tons} 吨，与装车数差异按验收量调账`,
      };
      syncTicket(tk);
    }
    review.status = "已对账";
    review.resolution = `油库验收确认实收 ${tk?.tons ?? ""} 吨，库存按验收量入账，差异留档备查`;
  }

  // ------------------------------ 库存调整 ------------------------------

  function adjustStock(station: Station, fuel: Fuel, delta: number, reason: string) {
    if (!delta) return;
    setStock(station, fuel, stockOf(station, fuel) + delta);
    const tk = issueTicket("库存调整", `${station} ${fuel} 库存 ${delta > 0 ? "+" : ""}${delta} 吨（${reason || "油库调账"}）`, {
      station, fuel, tons: delta,
    });
    syncTicket(tk); // 油库调账本身即权威
    addReview("油库调账", `${station} ${fuel} 库存调整 ${delta > 0 ? "+" : ""}${delta} 吨：${reason || "油库调账"}，未装车占用已按新库存重算`, {
      ticketId: tk.id,
    });
    recompute();
    toast("success", `库存已调整，所有未装车占用按新库存重算`);
  }

  // ------------------------------ 其他 ------------------------------

  function setOnline(v: boolean) {
    online.value = v;
    toast(v ? "success" : "warn", v ? "网络已恢复，可回传对账" : "已进入断网模式：现场可继续派车/发车，操作进入待回传队列");
  }

  function removeOrder(id: string) {
    const order = getOrder(id);
    if (!order) return;
    const truck = getTruck(order.truckId);
    if (truck && (truck.status === "待装" || truck.status === "待发")) releaseTruck(truck);
    const idx = orders.findIndex((o) => o.id === id);
    if (idx >= 0) orders.splice(idx, 1);
    recompute();
    toast("info", "配送单已删除");
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    const s = seed();
    orders.splice(0, orders.length, ...s.orders);
    trucks.splice(0, trucks.length, ...s.trucks);
    inventory.splice(0, inventory.length, ...s.inventory);
    tickets.splice(0, tickets.length, ...s.tickets);
    reviews.splice(0, reviews.length, ...s.reviews);
    seq.value = s.seq;
    online.value = true;
    toast("info", "已重置为演示数据");
  }

  // ------------------------------ 派生视图 ------------------------------

  const pendingReviews = computed(() => reviews.filter((r) => r.status === "待复核"));
  const resolvedReviews = computed(() => reviews.filter((r) => r.status === "已对账"));

  /** 缺口清单：库存不足以覆盖未装车需求的单据 */
  const gapOrders = computed(() =>
    orders
      .filter((o) => o.stage !== "已发车" && o.stage !== "已到站" && o.shortTons > 0)
      .sort((a, b) => b.shortTons - a.shortTons),
  );

  const dirtyCount = computed(() => tickets.filter((t) => !t.synced).length);

  const inventoryRows = computed(() =>
    STATIONS.map((station) => ({
      station,
      cells: FUELS.map((fuel) => {
        const item = inventory.find((i) => i.station === station && i.fuel === fuel)!;
        const reserve = orders
          .filter((o) => o.stage !== "已发车" && o.stage !== "已到站" && o.station === station && o.fuel === fuel)
          .reduce((sum, o) => sum + o.reservedTons, 0);
        return { fuel, stock: item.stock, reserved: Math.round(reserve * 100) / 100, free: Math.round((item.stock - reserve) * 100) / 100 };
      }),
    })),
  );

  const stageStats = computed(() => {
    const stages: DeliveryOrder["stage"][] = ["待派车", "待装车", "装车中", "待发车", "已发车", "已到站"];
    return stages.map((stage) => ({ stage, value: orders.filter((o) => o.stage === stage).length }));
  });

  recompute();

  return {
    // state
    orders, trucks, inventory, tickets, reviews, toasts, online,
    // computed
    idleTrucks, pendingReviews, resolvedReviews, gapOrders, dirtyCount, inventoryRows, stageStats,
    // helpers
    stockOf, getTruck, toast,
    // actions
    createOrder, assignTruck, simulateTruckConflict, submitLoad, simulateLoadDiff,
    recoverHalfLoad, depart, arrive, pullDepotAndReconcile, adjustStock,
    setOnline, removeOrder, resetAll,
  };
});

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
