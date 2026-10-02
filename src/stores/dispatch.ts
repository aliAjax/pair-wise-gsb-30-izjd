import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";

export type OrderStatus = "待派车" | "待装车" | "已发车" | "运输中" | "已到站" | "已验收";
export type TicketState = "完整" | "半份" | "已回滚";
export type ReviewState = "待复核" | "已核对" | "有差异" | "已处理";

export interface Order {
  id: string;
  ticketNo: number;
  station: string;
  fuel: string;
  tons: number;
  arriveAt: string;
  status: OrderStatus;
  truckId: string | null;
  /** 装车数：提交失败时可能只落了这一半 */
  loadedTons: number;
  /** 首次确认依据：已发车单据永远沿用第一次成功确认的领号 */
  firstConfirmation: string | null;
  conflict: boolean;
  offline: boolean;
  note: string;
  createdAt: string;
}

export interface Truck {
  id: string;
  plate: string;
  capacity: number;
  orderId: string | null;
}

export interface InventoryItem {
  station: string;
  fuel: string;
  onHand: number;
}

export type TicketPayload = { action: "confirmLoading"; orderId: string; tons: number } | null;

export interface Ticket {
  no: number;
  kind: string;
  summary: string;
  state: TicketState;
  /** 半份领号续办所需的现场数据 */
  payload: TicketPayload;
  /** 完整领号留下的恢复点（配送单 + 罐车） */
  snapshot: { orders: Order[]; trucks: Truck[] } | null;
  createdAt: string;
}

/** 平板待复核记录 */
export interface ReviewRecord {
  id: string;
  orderId: string;
  kind: "装车记录" | "抢占冲突";
  ticketNo: number;
  loadedTons: number;
  state: ReviewState;
  detail: string;
}

/** 油库验收结果 */
export interface Acceptance {
  id: string;
  orderId: string;
  ticketNo: number;
  acceptedTons: number;
  createdAt: string;
}

export interface OfflineDispatch {
  id: string;
  orderId: string;
  truckId: string;
  ticketNo: number;
}

const STORAGE_KEY = "hxwlfront-19-flood-dispatch-v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface Persisted {
  version: 1;
  orders: Order[];
  trucks: Truck[];
  inventory: InventoryItem[];
  tickets: Ticket[];
  reviews: ReviewRecord[];
  acceptances: Acceptance[];
  offlineQueue: OfflineDispatch[];
  ticketCounter: number;
}

function seedState(): Persisted {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

  const trucks: Truck[] = [
    { id: "t1", plate: "鲁A·D1001", capacity: 30, orderId: "o1" },
    { id: "t2", plate: "鲁A·D1002", capacity: 30, orderId: "o6" },
    { id: "t3", plate: "鲁B·D2003", capacity: 25, orderId: "o4" },
    { id: "t4", plate: "鲁B·D2004", capacity: 25, orderId: "o5" },
    { id: "t5", plate: "鲁B·D2005", capacity: 25, orderId: null }
  ];

  const orders: Order[] = [
    { id: "o6", ticketNo: 7, station: "城东站", fuel: "92号汽油", tons: 5, arriveAt: "2026-10-03", status: "待装车", truckId: "t2", loadedTons: 0, firstConfirmation: null, conflict: false, offline: false, note: "断网点回传的单据，装车提交曾失败", createdAt: at(6) },
    { id: "o5", ticketNo: 6, station: "城东站", fuel: "柴油", tons: 10, arriveAt: "2026-10-03", status: "已到站", truckId: "t4", loadedTons: 10, firstConfirmation: "领号#6", conflict: false, offline: false, note: "到站待油库验收", createdAt: at(20) },
    { id: "o4", ticketNo: 5, station: "机场站", fuel: "柴油", tons: 8, arriveAt: "2026-10-03", status: "已发车", truckId: "t3", loadedTons: 8, firstConfirmation: "领号#5", conflict: false, offline: false, note: "平板已记录装车，待与验收对账", createdAt: at(26) },
    { id: "o3", ticketNo: 4, station: "新区站", fuel: "92号汽油", tons: 15, arriveAt: "2026-10-04", status: "待派车", truckId: null, loadedTons: 0, firstConfirmation: null, conflict: false, offline: false, note: "新区站库存偏紧，关注缺口", createdAt: at(30) },
    { id: "o2", ticketNo: 3, station: "机场站", fuel: "柴油", tons: 12, arriveAt: "2026-10-04", status: "待派车", truckId: null, loadedTons: 0, firstConfirmation: null, conflict: false, offline: false, note: "等待派车", createdAt: at(32) },
    { id: "o1", ticketNo: 2, station: "城东站", fuel: "92号汽油", tons: 18, arriveAt: "2026-10-03", status: "待装车", truckId: "t1", loadedTons: 0, firstConfirmation: null, conflict: false, offline: false, note: "车辆已到位，等待装车", createdAt: at(40) }
  ];

  const mkTicket = (no: number, kind: string, summary: string, hoursAgo: number, extra?: Partial<Ticket>): Ticket => ({
    no,
    kind,
    summary,
    state: "完整",
    payload: null,
    snapshot: null,
    createdAt: at(hoursAgo),
    ...extra
  });

  // 最近完整领号 #8 的恢复点：此时 o6 的装车数尚未落库
  const snapshotAt8 = {
    orders: clone(orders),
    trucks: clone(trucks)
  };

  const tickets: Ticket[] = [
    mkTicket(9, "装车发车", "领号#7 城东站/92号汽油 装车 5 吨（提交中断，装车数只落了一半）", 1, {
      state: "半份",
      payload: { action: "confirmLoading", orderId: "o6", tons: 5 }
    }),
    mkTicket(8, "库存调整", "城东站/92号汽油 库存盘点 → 40 吨", 2, { snapshot: snapshotAt8 }),
    mkTicket(7, "创建配送单", "城东站/92号汽油 5 吨（含派车 鲁A·D1002）", 6),
    mkTicket(6, "装车发车", "城东站/柴油 10 吨，首次确认依据 领号#6", 18),
    mkTicket(5, "装车发车", "机场站/柴油 8 吨，首次确认依据 领号#5", 24),
    mkTicket(4, "创建配送单", "新区站/92号汽油 15 吨", 30),
    mkTicket(3, "创建配送单", "机场站/柴油 12 吨", 32),
    mkTicket(2, "派车", "鲁A·D1001 → 领号#1 城东站单", 38),
    mkTicket(1, "创建配送单", "城东站/92号汽油 18 吨", 40)
  ];

  // 半份领号 #9 留下的痕迹：装车数落了，状态没推进
  const o6 = orders.find((order) => order.id === "o6");
  if (o6) o6.loadedTons = 5;

  return {
    version: 1,
    orders,
    trucks,
    inventory: [
      { station: "城东站", fuel: "92号汽油", onHand: 40 },
      { station: "城东站", fuel: "柴油", onHand: 20 },
      { station: "机场站", fuel: "95号汽油", onHand: 25 },
      { station: "机场站", fuel: "柴油", onHand: 15 },
      { station: "新区站", fuel: "92号汽油", onHand: 10 },
      { station: "新区站", fuel: "柴油", onHand: 30 }
    ],
    tickets,
    reviews: [
      { id: "r1", orderId: "o4", kind: "装车记录", ticketNo: 5, loadedTons: 8, state: "待复核", detail: "平板装车记录，回传顺序不一致，待与油库验收对账" }
    ],
    acceptances: [],
    offlineQueue: [],
    ticketCounter: 9
  };
}

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.orders)) return parsed;
    }
  } catch {
    // 数据损坏时回到演示数据
  }
  return seedState();
}

export const useDispatchStore = defineStore("dispatch", () => {
  const persisted = loadState();
  const orders = ref<Order[]>(persisted.orders);
  const trucks = ref<Truck[]>(persisted.trucks);
  const inventory = ref<InventoryItem[]>(persisted.inventory);
  const tickets = ref<Ticket[]>(persisted.tickets);
  const reviews = ref<ReviewRecord[]>(persisted.reviews);
  const acceptances = ref<Acceptance[]>(persisted.acceptances);
  const offlineQueue = ref<OfflineDispatch[]>(persisted.offlineQueue);
  const ticketCounter = ref<number>(persisted.ticketCounter);

  watch(
    [orders, trucks, inventory, tickets, reviews, acceptances, offlineQueue, ticketCounter],
    () => {
      const state: Persisted = {
        version: 1,
        orders: orders.value,
        trucks: trucks.value,
        inventory: inventory.value,
        tickets: tickets.value,
        reviews: reviews.value,
        acceptances: acceptances.value,
        offlineQueue: offlineQueue.value,
        ticketCounter: ticketCounter.value
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    { deep: true }
  );

  // ---------- 领号 ----------

  function takeTicket(kind: string, summary: string, payload: TicketPayload = null): Ticket {
    ticketCounter.value += 1;
    const ticket: Ticket = {
      no: ticketCounter.value,
      kind,
      summary,
      state: "半份",
      payload,
      snapshot: null,
      createdAt: nowIso()
    };
    tickets.value.unshift(ticket);
    return ticket;
  }

  /** 操作全部落库后销号：留下恢复点，领号转完整 */
  function commitTicket(ticket: Ticket) {
    ticket.state = "完整";
    ticket.snapshot = { orders: clone(orders.value), trucks: clone(trucks.value) };
  }

  const lastCommittedTicket = computed(() => tickets.value.find((ticket) => ticket.state === "完整" && ticket.snapshot) ?? null);
  const partialTickets = computed(() => tickets.value.filter((ticket) => ticket.state === "半份"));

  // ---------- 派车与回传 ----------

  function applyDispatch(order: Order, truck: Truck, ticket: Ticket) {
    order.offline = false;
    if (!truck.orderId || truck.orderId === order.id) {
      truck.orderId = order.id;
      order.truckId = truck.id;
      order.status = "待装车";
      order.conflict = false;
      ticket.summary += `：${truck.plate} 派车成功`;
      return;
    }
    // 两张单抢占同一辆罐车
    const holder = orders.value.find((item) => item.id === truck.orderId);
    order.conflict = true;
    order.truckId = null;
    reviews.value.unshift({
      id: uid(),
      orderId: order.id,
      kind: "抢占冲突",
      ticketNo: ticket.no,
      loadedTons: 0,
      state: "待复核",
      detail: `罐车 ${truck.plate} 已被领号#${holder?.ticketNo ?? "?"} 占用，两张单抢占同一辆罐车，待改派或取消占用`
    });
    ticket.summary += `：${truck.plate} 已被领号#${holder?.ticketNo ?? "?"} 占用，抢占冲突转待复核`;
  }

  function dispatchTruck(orderId: string, truckId: string, offline: boolean) {
    const order = orders.value.find((item) => item.id === orderId);
    const truck = trucks.value.find((item) => item.id === truckId);
    if (!order || !truck || order.status !== "待派车" || order.conflict || order.offline) return;

    if (offline) {
      const ticket = takeTicket("离线派车", `领号#${order.ticketNo} ${order.station}/${order.fuel} 断网派车 ${truck.plate}，入离线队列`);
      order.offline = true;
      order.note = "断网派车已入队，回传后生效";
      offlineQueue.value.push({ id: uid(), orderId: order.id, truckId: truck.id, ticketNo: ticket.no });
      commitTicket(ticket);
      return;
    }

    const ticket = takeTicket("派车", `领号#${order.ticketNo} ${order.station}/${order.fuel} 派车`);
    applyDispatch(order, truck, ticket);
    commitTicket(ticket);
  }

  /** 回传：顺序可能与派车顺序不一致，按到达顺序逐条处理 */
  function syncBack() {
    if (offlineQueue.value.length === 0) return;
    const arrived = [...offlineQueue.value].reverse();
    offlineQueue.value = [];
    for (const item of arrived) {
      const order = orders.value.find((entry) => entry.id === item.orderId);
      const truck = trucks.value.find((entry) => entry.id === item.truckId);
      if (!order || !truck) continue;
      const ticket = takeTicket("回传", `离线领号#${item.ticketNo} 回传：领号#${order.ticketNo} ${order.station}/${order.fuel} → ${truck.plate}`);
      if (order.status !== "待派车" || order.truckId) {
        order.offline = false;
        ticket.summary += "（单据状态已变化，忽略）";
      } else {
        applyDispatch(order, truck, ticket);
      }
      commitTicket(ticket);
    }
  }

  function resolveConflict(orderId: string, truckId: string) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || !order.conflict) return;
    const ticket = takeTicket("冲突处理", `领号#${order.ticketNo} ${order.station}/${order.fuel} 抢占冲突处理`);
    order.conflict = false;
    if (truckId) {
      const truck = trucks.value.find((item) => item.id === truckId);
      if (truck && !truck.orderId) {
        truck.orderId = order.id;
        order.truckId = truck.id;
        order.status = "待装车";
        ticket.summary += `：改派 ${truck.plate}`;
      }
    } else {
      order.truckId = null;
      order.status = "待派车";
      ticket.summary += "：取消占用，重新排队派车";
    }
    reviews.value.forEach((review) => {
      if (review.orderId === order.id && review.kind === "抢占冲突" && review.state === "待复核") {
        review.state = "已处理";
        review.detail += "（已处理）";
      }
    });
    commitTicket(ticket);
  }

  // ---------- 装车发车（含失败与续办） ----------

  function completeLoading(ticket: Ticket, order: Order, tons: number) {
    order.status = "已发车";
    // 已发车单据沿用首次确认依据，不覆盖
    if (!order.firstConfirmation) order.firstConfirmation = `领号#${ticket.no}`;
    reviews.value.unshift({
      id: uid(),
      orderId: order.id,
      kind: "装车记录",
      ticketNo: ticket.no,
      loadedTons: tons,
      state: "待复核",
      detail: "平板装车记录，待与油库验收对账"
    });
    commitTicket(ticket);
  }

  function confirmLoading(orderId: string, tons: number, fail: boolean) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || order.status !== "待装车" || order.conflict) return;
    const safeTons = Math.max(0, Number(tons) || 0);
    const ticket = takeTicket(
      "装车发车",
      `领号#${order.ticketNo} ${order.station}/${order.fuel} 装车 ${safeTons} 吨`,
      { action: "confirmLoading", orderId: order.id, tons: safeTons }
    );
    // 装车数先落库——提交失败时只留这一半
    order.loadedTons = safeTons;
    if (fail) {
      ticket.summary += "（提交中断，装车数只落了一半）";
      return;
    }
    completeLoading(ticket, order, safeTons);
  }

  /** 续办：把半份领号没走完的操作补完，沿用原领号 */
  function resumeTicket(no: number) {
    const ticket = tickets.value.find((item) => item.no === no);
    if (!ticket || ticket.state !== "半份" || !ticket.payload) return;
    if (ticket.payload.action === "confirmLoading") {
      const order = orders.value.find((item) => item.id === ticket.payload?.orderId);
      if (!order || order.status !== "待装车") return;
      order.loadedTons = ticket.payload.tons;
      ticket.summary += "（已续办）";
      completeLoading(ticket, order, ticket.payload.tons);
    }
  }

  /** 故障恢复：回到最近完整领号的恢复点，半份领号作废 */
  function recover() {
    if (partialTickets.value.length === 0) return;
    const lastCommitted = lastCommittedTicket.value;
    if (!lastCommitted || !lastCommitted.snapshot) return;
    orders.value = clone(lastCommitted.snapshot.orders);
    trucks.value = clone(lastCommitted.snapshot.trucks);
    tickets.value.forEach((ticket) => {
      if (ticket.state === "半份") ticket.state = "已回滚";
    });
    const ticket = takeTicket(
      "故障恢复",
      `从最近完整领号 #${lastCommitted.no} 恢复，半份领号已回滚；已发车单据沿用首次确认依据`
    );
    commitTicket(ticket);
  }

  // ---------- 运输与验收 ----------

  const FLOW: Partial<Record<OrderStatus, OrderStatus>> = { 已发车: "运输中", 运输中: "已到站" };

  function advance(orderId: string) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order) return;
    const next = FLOW[order.status];
    if (!next) return;
    const ticket = takeTicket("运输流转", `领号#${order.ticketNo} ${order.station}/${order.fuel} ${order.status} → ${next}`);
    order.status = next;
    commitTicket(ticket);
  }

  /** 油库验收：结果入库，库存变化触发未装车占用重算 */
  function accept(orderId: string, acceptedTons: number) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || order.status !== "已到站") return;
    const safeTons = Math.max(0, Number(acceptedTons) || 0);
    const ticket = takeTicket("油库验收", `领号#${order.ticketNo} ${order.station}/${order.fuel} 验收 ${safeTons} 吨`);
    order.status = "已验收";
    acceptances.value.unshift({ id: uid(), orderId: order.id, ticketNo: ticket.no, acceptedTons: safeTons, createdAt: nowIso() });
    const item = inventory.value.find((entry) => entry.station === order.station && entry.fuel === order.fuel);
    if (item) item.onHand += safeTons;
    else inventory.value.push({ station: order.station, fuel: order.fuel, onHand: safeTons });
    const truck = trucks.value.find((entry) => entry.orderId === order.id);
    if (truck) truck.orderId = null;
    commitTicket(ticket);
  }

  /** 对账：按油库验收结果核对平板待复核记录 */
  function reconcile() {
    const ticket = takeTicket("对账", "按油库验收结果与平板待复核记录逐单对账");
    let matched = 0;
    let diff = 0;
    let waiting = 0;
    for (const review of reviews.value) {
      if (review.kind !== "装车记录" || review.state === "已处理") continue;
      const acceptance = acceptances.value.find((entry) => entry.orderId === review.orderId);
      if (!acceptance) {
        review.state = "待复核";
        review.detail = "缺油库验收结果，等待验收回传";
        waiting += 1;
        continue;
      }
      if (acceptance.acceptedTons === review.loadedTons) {
        review.state = "已核对";
        review.detail = `与油库验收一致（${acceptance.acceptedTons} 吨，验收领号#${acceptance.ticketNo}）`;
        matched += 1;
      } else {
        review.state = "有差异";
        review.detail = `平板装车 ${review.loadedTons} 吨 ≠ 油库验收 ${acceptance.acceptedTons} 吨（验收领号#${acceptance.ticketNo}）`;
        diff += 1;
      }
    }
    ticket.summary = `对账完成：一致 ${matched} 单，有差异 ${diff} 单，待验收 ${waiting} 单`;
    commitTicket(ticket);
  }

  // ---------- 库存 ----------

  function adjustInventory(station: string, fuel: string, onHand: number) {
    const item = inventory.value.find((entry) => entry.station === station && entry.fuel === fuel);
    if (!item) return;
    const safe = Math.max(0, Number(onHand) || 0);
    if (item.onHand === safe) return;
    const ticket = takeTicket("库存调整", `${station}/${fuel} 库存 ${item.onHand} → ${safe} 吨，未装车占用按新库存重算`);
    item.onHand = safe;
    commitTicket(ticket);
  }

  // ---------- 派生数据 ----------

  /** 未装车占用：待派车 + 待装车的单据都会占用库存 */
  function reservedOf(station: string, fuel: string) {
    return orders.value
      .filter((order) => order.station === station && order.fuel === fuel && (order.status === "待派车" || order.status === "待装车"))
      .reduce((sum, order) => sum + order.tons, 0);
  }

  const inventoryRows = computed(() =>
    inventory.value.map((item) => {
      const reserved = reservedOf(item.station, item.fuel);
      const available = item.onHand - reserved;
      return { ...item, reserved, available, gap: Math.max(0, -available) };
    })
  );

  const shortfalls = computed(() => inventoryRows.value.filter((row) => row.gap > 0));
  const freeTrucks = computed(() => trucks.value.filter((truck) => !truck.orderId));
  const conflictOrders = computed(() => orders.value.filter((order) => order.conflict));
  const pendingReviewRecords = computed(() =>
    reviews.value.filter((review) => review.kind === "装车记录" && (review.state === "待复核" || review.state === "有差异"))
  );
  const unmatchedAcceptances = computed(() =>
    acceptances.value.filter(
      (acceptance) => !reviews.value.some((review) => review.kind === "装车记录" && review.orderId === acceptance.orderId)
    )
  );
  const pendingCount = computed(
    () =>
      partialTickets.value.length +
      conflictOrders.value.length +
      pendingReviewRecords.value.length +
      unmatchedAcceptances.value.length
  );

  // ---------- 创建与重置 ----------

  function createOrder(form: { station: string; fuel: string; tons: number; arriveAt: string; note: string }) {
    const ticket = takeTicket("创建配送单", `${form.station}/${form.fuel} ${form.tons} 吨`);
    orders.value.unshift({
      id: uid(),
      ticketNo: ticket.no,
      station: form.station,
      fuel: form.fuel,
      tons: Math.max(0, Number(form.tons) || 0),
      arriveAt: form.arriveAt,
      status: "待派车",
      truckId: null,
      loadedTons: 0,
      firstConfirmation: null,
      conflict: false,
      offline: false,
      note: form.note || "暂无备注",
      createdAt: nowIso()
    });
    commitTicket(ticket);
  }

  function resetDemo() {
    const seed = seedState();
    orders.value = seed.orders;
    trucks.value = seed.trucks;
    inventory.value = seed.inventory;
    tickets.value = seed.tickets;
    reviews.value = seed.reviews;
    acceptances.value = seed.acceptances;
    offlineQueue.value = seed.offlineQueue;
    ticketCounter.value = seed.ticketCounter;
  }

  return {
    orders,
    trucks,
    inventory,
    tickets,
    reviews,
    acceptances,
    offlineQueue,
    ticketCounter,
    lastCommittedTicket,
    partialTickets,
    inventoryRows,
    shortfalls,
    freeTrucks,
    conflictOrders,
    pendingReviewRecords,
    unmatchedAcceptances,
    pendingCount,
    createOrder,
    dispatchTruck,
    syncBack,
    resolveConflict,
    confirmLoading,
    resumeTicket,
    recover,
    advance,
    accept,
    reconcile,
    adjustInventory,
    resetDemo
  };
});
