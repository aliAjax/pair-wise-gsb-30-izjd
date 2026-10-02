// 领域模型：配送单 / 油罐车 / 油站库存 全部挂“领号”流水，支持断网续办

export type Fuel = "92号汽油" | "95号汽油" | "柴油";
export type Station = "城东站" | "机场站" | "新区站";

export const FUELS: Fuel[] = ["92号汽油", "95号汽油", "柴油"];
export const STATIONS: Station[] = ["城东站", "机场站", "新区站"];

/** 配送单阶段 */
export type OrderStage = "待派车" | "待装车" | "装车中" | "待发车" | "已发车" | "已到站";

export type TruckStatus = "空闲" | "待装" | "待发" | "在途";

/** 领号操作类型：每张单据的每一步都领取独立领号 */
export type OpKind = "建单" | "派车" | "装车" | "发车" | "到站" | "库存调整";

export interface DeliveryOrder {
  id: string;
  code: string; // 配送单号
  station: Station;
  fuel: Fuel;
  tons: number; // 计划配送吨数
  stage: OrderStage;
  loadedTons: number; // 已装车数（提交失败时可能只落账半份）
  truckId: string | null;
  claimTicketId: string | null; // 派车首次确认领号（续办/对账沿用依据）
  firstConfirmAt: string | null; // 首次确认时间（同车抢占裁决依据）
  loadTicketIds: string[];
  departTicketId: string | null;
  arriveTicketId: string | null;
  dirtyTicketIds: string[]; // 已领取但尚未回传油库的领号
  // —— 库存占用（库存一变即按新库存重算）——
  reservedTons: number;
  shortTons: number; // 缺口吨数
  createdAt: string;
}

export interface Truck {
  id: string;
  plate: string;
  capacity: number;
  fuel: Fuel | null;
  loadedTons: number;
  status: TruckStatus;
  orderId: string | null;
}

export interface InventoryItem {
  station: Station;
  fuel: Fuel;
  stock: number; // 油库验收后的权威可调拨库存
}

/** 油库验收结果（回传对账的权威方） */
export interface DepotResult {
  accepted: boolean; // 油库是否已验收（仅收到未验收时为 false）
  acceptedTons?: number;
  winnerTicketId?: string; // 同车抢占时油库认定的在先领号
  stockAfter?: number;
  message: string;
  receivedAt: string;
}

/** 领号：可续办操作的最小单元 */
export interface Ticket {
  id: string;
  seq: number;
  kind: OpKind;
  at: string;
  offline: boolean; // 领取时是否断网
  complete: boolean; // 本地是否完整落账（false=半份）
  synced: boolean; // 是否已回传油库
  needsRedo: boolean; // 回滚后待续办
  orderId?: string;
  truckId?: string;
  station?: Station;
  fuel?: Fuel;
  tons?: number;
  basisTicketId?: string; // 发车等操作沿用的首次确认依据
  note: string;
  errorMsg?: string;
  depot?: DepotResult;
}

export type ReviewKind = "车辆抢占" | "装车差异" | "验收待对" | "半份恢复" | "油库调账";

/** 平板待复核记录：现场先记一笔，回网后与油库验收结果对账 */
export interface TabletReview {
  id: string;
  at: string;
  kind: ReviewKind;
  orderId?: string;
  truckId?: string;
  ticketId?: string;
  competitorAt?: string; // 抢占场景：对方领号的首次确认时间
  message: string;
  status: "待复核" | "已对账";
  resolution?: string;
}

export interface Toast {
  id: string;
  type: "info" | "success" | "error" | "warn";
  text: string;
}
