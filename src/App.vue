<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useDispatchStore } from "./stores/dispatch";
import type { Order, Truck } from "./stores/dispatch";

const project = {
  title: "油品配送计划",
  subtitle:
    "汛期断网续办调度台：配送单、油罐车、油站库存全部领号化。断网派车回传后按油库验收与平板待复核记录对账；提交失败从最近完整领号恢复，已发车单据沿用首次确认依据；库存一变，未装车占用与缺口实时重算。",
  industry: "石油",
  stack: ["Vue3", "Vite", "TypeScript", "Pinia", "Element Plus"],
  stations: ["城东站", "机场站", "新区站"],
  fuels: ["92号汽油", "95号汽油", "柴油"],
  statuses: ["待派车", "待装车", "已发车", "运输中", "已到站", "已验收"]
} as const;

const store = useDispatchStore();
const {
  orders,
  trucks,
  tickets,
  reviews,
  acceptances,
  offlineQueue,
  lastCommittedTicket,
  partialTickets,
  inventoryRows,
  shortfalls,
  freeTrucks,
  conflictOrders,
  pendingReviewRecords,
  unmatchedAcceptances,
  pendingCount
} = storeToRefs(store);

const offlineMode = ref(false);
const filter = ref("全部油站");
const filters = computed(() => ["全部油站", ...project.stations]);
const form = reactive({ station: "", fuel: "", tons: 0, arriveAt: "", note: "" });

const filteredOrders = computed(() =>
  filter.value === "全部油站" ? orders.value : orders.value.filter((order) => order.station === filter.value)
);

const totalGap = computed(() => shortfalls.value.reduce((sum, row) => sum + row.gap, 0));

const metrics = computed(() => [
  { label: "配送单", value: orders.value.length },
  { label: "待复核事项", value: pendingCount.value },
  { label: "库存缺口（吨）", value: totalGap.value },
  { label: "最近完整领号", value: lastCommittedTicket.value ? `#${lastCommittedTicket.value.no}` : "—" }
]);

const chartRows = computed(() =>
  project.statuses.map((status) => ({ status, value: orders.value.filter((order) => order.status === status).length }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));

const loadingReviews = computed(() => reviews.value.filter((review) => review.kind === "装车记录"));
const selectableTrucks = computed(() => (offlineMode.value ? trucks.value : freeTrucks.value));

const drafts = reactive<Record<string, { truckId: string; loadedTons: number; acceptedTons: number }>>({});
function draft(order: Order) {
  if (!drafts[order.id]) {
    drafts[order.id] = {
      truckId: "",
      loadedTons: order.loadedTons || order.tons,
      acceptedTons: order.loadedTons || order.tons
    };
  }
  return drafts[order.id];
}

function truckPlate(id: string | null) {
  return trucks.value.find((truck) => truck.id === id)?.plate ?? "—";
}

function orderLabel(order: Order) {
  return `领号#${order.ticketNo} ${order.station}/${order.fuel} ${order.tons}吨`;
}

function orderLabelById(id: string) {
  const order = orders.value.find((item) => item.id === id);
  return order ? orderLabel(order) : "（单据已不在当前状态）";
}

function acceptanceOf(orderId: string) {
  return acceptances.value.find((acceptance) => acceptance.orderId === orderId);
}

function hasPartialFor(order: Order) {
  return partialTickets.value.some((ticket) => ticket.payload?.orderId === order.id);
}

function truckStatus(truck: Truck) {
  if (!truck.orderId) return "空闲";
  const order = orders.value.find((item) => item.id === truck.orderId);
  return order && ["已发车", "运输中", "已到站"].includes(order.status) ? "运输中" : "已占用";
}

function fmtTime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusClass(status: string) {
  if (status === "待派车") return "badge muted";
  if (status === "待装车") return "badge warn";
  if (status === "已验收") return "badge muted";
  return "badge ok";
}

function ticketStateClass(state: string) {
  if (state === "完整") return "badge ok";
  if (state === "半份") return "badge bad";
  return "badge muted";
}

function reviewStateClass(state: string) {
  if (state === "已核对") return "badge ok";
  if (state === "有差异") return "badge bad";
  if (state === "待复核") return "badge warn";
  return "badge muted";
}

function submitOrder() {
  store.createOrder({ ...form });
  Object.assign(form, { station: "", fuel: "", tons: 0, arriveAt: "", note: "" });
}

function onInventoryChange(station: string, fuel: string, event: Event) {
  store.adjustInventory(station, fuel, Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ project.industry }}行业 · 汛期调运</p>
          <h1>{{ project.title }}</h1>
          <p class="subtitle">{{ project.subtitle }}</p>
        </div>
        <div class="stack">
          <span v-for="item in project.stack" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <section class="control-bar">
        <label class="toggle">
          <input type="checkbox" v-model="offlineMode" />
          断网模式（派车先领号入离线队列，回传后生效）
        </label>
        <button type="button" :disabled="offlineQueue.length === 0" @click="store.syncBack()">
          回传离线队列（{{ offlineQueue.length }}）
        </button>
        <button type="button" class="secondary" @click="store.reconcile()">按验收结果对账</button>
        <button
          type="button"
          class="danger"
          :disabled="partialTickets.length === 0"
          @click="store.recover()"
        >
          从最近完整领号恢复{{ lastCommittedTicket ? `（#${lastCommittedTicket.no}）` : "" }}
        </button>
        <button type="button" class="secondary" @click="store.resetDemo()">重置演示数据</button>
      </section>

      <section class="workspace">
        <div class="col">
          <form class="panel" @submit.prevent="submitOrder">
            <h2>创建配送单</h2>
            <div class="form-grid">
              <label>
                目标油站
                <select v-model="form.station" required>
                  <option value="">请选择</option>
                  <option v-for="station in project.stations" :key="station">{{ station }}</option>
                </select>
              </label>
              <label>
                油品
                <select v-model="form.fuel" required>
                  <option value="">请选择</option>
                  <option v-for="fuel in project.fuels" :key="fuel">{{ fuel }}</option>
                </select>
              </label>
              <label>
                配送吨数
                <input v-model.number="form.tons" type="number" min="1" required />
              </label>
              <label>
                计划到达
                <input v-model="form.arriveAt" type="date" required />
              </label>
              <label>
                备注
                <textarea v-model="form.note" placeholder="填写汛期路况、现场说明等" />
              </label>
              <button type="submit">保存配送单（自动领号）</button>
            </div>
          </form>

          <section class="panel">
            <h2>油站库存 · 未装车占用实时重算</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>油站</th>
                  <th>油品</th>
                  <th>现库存(吨)</th>
                  <th>未装车占用</th>
                  <th>可用</th>
                  <th>缺口</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in inventoryRows" :key="row.station + row.fuel">
                  <td>{{ row.station }}</td>
                  <td>{{ row.fuel }}</td>
                  <td>
                    <input
                      class="compact"
                      type="number"
                      min="0"
                      :value="row.onHand"
                      @change="onInventoryChange(row.station, row.fuel, $event)"
                    />
                  </td>
                  <td>{{ row.reserved }}</td>
                  <td>{{ row.available }}</td>
                  <td>
                    <span v-if="row.gap > 0" class="gap-text">缺 {{ row.gap }} 吨</span>
                    <span v-else class="badge ok">充足</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="hint">改库存、验收人库或单据状态变化时，未装车占用与缺口立即按新库存重算。</p>
          </section>
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>配送单列表</h2>
            <select v-model="filter" class="compact">
              <option v-for="item in filters" :key="item">{{ item }}</option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="filteredOrders.length === 0" class="empty">暂无匹配数据</div>
            <article v-for="order in filteredOrders" :key="order.id" class="record">
              <div class="record-head">
                <p class="record-title">领号#{{ order.ticketNo }} · {{ order.station }} / {{ order.fuel }}</p>
                <span class="badges">
                  <span :class="statusClass(order.status)">{{ order.status }}</span>
                  <span v-if="order.conflict" class="badge bad">抢占冲突</span>
                  <span v-else-if="order.offline" class="badge warn">待回传</span>
                  <span v-if="hasPartialFor(order)" class="badge bad">半份装车数</span>
                </span>
              </div>
              <div class="details">
                <span>配送吨数: {{ order.tons }}</span>
                <span>计划到达: {{ order.arriveAt }}</span>
                <span>装车数: {{ order.loadedTons || "—" }}</span>
                <span>罐车: {{ truckPlate(order.truckId) }}</span>
                <span>首次确认依据: {{ order.firstConfirmation || "—" }}</span>
                <span>创建时间: {{ fmtTime(order.createdAt) }}</span>
              </div>
              <p class="note">{{ order.note }}</p>
              <div class="actions">
                <template v-if="order.status === '待派车' && !order.conflict && !order.offline">
                  <select class="compact" v-model="draft(order).truckId">
                    <option value="">选择罐车</option>
                    <option v-for="truck in selectableTrucks" :key="truck.id" :value="truck.id">
                      {{ truck.plate }}（{{ truck.capacity }}吨）{{ truck.orderId ? "·占用中" : "" }}
                    </option>
                  </select>
                  <button
                    type="button"
                    :disabled="!draft(order).truckId"
                    @click="store.dispatchTruck(order.id, draft(order).truckId, offlineMode)"
                  >
                    {{ offlineMode ? "断网派车（入队）" : "派车" }}
                  </button>
                </template>

                <template v-if="order.conflict">
                  <select class="compact" v-model="draft(order).truckId">
                    <option value="">选择空闲罐车</option>
                    <option v-for="truck in freeTrucks" :key="truck.id" :value="truck.id">
                      {{ truck.plate }}（{{ truck.capacity }}吨）
                    </option>
                  </select>
                  <button
                    type="button"
                    :disabled="!draft(order).truckId"
                    @click="store.resolveConflict(order.id, draft(order).truckId)"
                  >
                    改派
                  </button>
                  <button type="button" class="secondary" @click="store.resolveConflict(order.id, '')">取消占用</button>
                </template>

                <template v-if="order.status === '待装车' && !order.conflict">
                  <input class="compact" type="number" min="0" v-model.number="draft(order).loadedTons" />
                  <button type="button" @click="store.confirmLoading(order.id, draft(order).loadedTons, false)">
                    确认装车发车
                  </button>
                  <button type="button" class="secondary" @click="store.confirmLoading(order.id, draft(order).loadedTons, true)">
                    模拟提交失败
                  </button>
                </template>

                <button
                  v-if="order.status === '已发车' || order.status === '运输中'"
                  type="button"
                  @click="store.advance(order.id)"
                >
                  流转状态（→ {{ order.status === "已发车" ? "运输中" : "已到站" }}）
                </button>

                <template v-if="order.status === '已到站'">
                  <input class="compact" type="number" min="0" v-model.number="draft(order).acceptedTons" />
                  <button type="button" @click="store.accept(order.id, draft(order).acceptedTons)">油库验收</button>
                </template>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>

      <section class="panel-grid">
        <section class="panel">
          <h2>油罐车</h2>
          <table class="table">
            <thead>
              <tr>
                <th>车牌</th>
                <th>载重</th>
                <th>状态</th>
                <th>当前单据</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="truck in trucks" :key="truck.id">
                <td>{{ truck.plate }}</td>
                <td>{{ truck.capacity }} 吨</td>
                <td><span :class="truck.orderId ? 'badge warn' : 'badge ok'">{{ truckStatus(truck) }}</span></td>
                <td>{{ truck.orderId ? orderLabelById(truck.orderId) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h2>离线回传队列</h2>
          <p class="hint">断网派车先领号入队；回传顺序可能与派车顺序不一致，按到达顺序处理，抢占同一罐车的单据转待复核。</p>
          <div v-if="offlineQueue.length === 0" class="empty">暂无待回传派车</div>
          <div v-else class="review-list">
            <div v-for="item in offlineQueue" :key="item.id" class="review-item">
              <span>离线领号#{{ item.ticketNo }} · {{ orderLabelById(item.orderId) }} → {{ truckPlate(item.truckId) }}</span>
              <span class="badge warn">待回传</span>
            </div>
          </div>
        </section>

        <section class="panel wide">
          <div class="toolbar">
            <h2>回传对账 · 油库验收 × 平板待复核</h2>
            <button type="button" @click="store.reconcile()">发起对账</button>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>单据</th>
                <th>平板装车数</th>
                <th>油库验收数</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="review in loadingReviews" :key="review.id">
                <td>{{ orderLabelById(review.orderId) }}</td>
                <td>{{ review.loadedTons }} 吨（领号#{{ review.ticketNo }}）</td>
                <td>
                  <template v-if="acceptanceOf(review.orderId)">
                    {{ acceptanceOf(review.orderId)!.acceptedTons }} 吨（领号#{{ acceptanceOf(review.orderId)!.ticketNo }}）
                  </template>
                  <template v-else>—</template>
                </td>
                <td><span :class="reviewStateClass(review.state)">{{ review.state }}</span></td>
                <td>{{ review.detail }}</td>
              </tr>
              <tr v-if="loadingReviews.length === 0">
                <td colspan="5" class="empty">暂无平板装车记录</td>
              </tr>
            </tbody>
          </table>
          <template v-if="unmatchedAcceptances.length > 0">
            <h3>仅有验收、缺平板记录</h3>
            <div class="review-list">
              <div v-for="acceptance in unmatchedAcceptances" :key="acceptance.id" class="review-item">
                <span>{{ orderLabelById(acceptance.orderId) }} —— 油库验收 {{ acceptance.acceptedTons }} 吨（领号#{{ acceptance.ticketNo }}）</span>
                <span class="badge warn">缺平板记录</span>
              </div>
            </div>
          </template>
        </section>

        <section class="panel wide">
          <div class="toolbar">
            <h2>领号流水 · 可续办</h2>
            <span class="hint">已领 {{ tickets.length }} 张 · 半份 {{ partialTickets.length }} 张</span>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>领号</th>
                <th>类型</th>
                <th>摘要</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ticket in tickets" :key="ticket.no">
                <td>#{{ ticket.no }}</td>
                <td>{{ ticket.kind }}</td>
                <td>{{ ticket.summary }}</td>
                <td><span :class="ticketStateClass(ticket.state)">{{ ticket.state }}</span></td>
                <td>{{ fmtTime(ticket.createdAt) }}</td>
                <td>
                  <button
                    v-if="ticket.state === '半份' && ticket.payload"
                    type="button"
                    class="secondary"
                    @click="store.resumeTicket(ticket.no)"
                  >
                    续办
                  </button>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel wide">
          <h2>待复核与缺口</h2>
          <div class="two-col">
            <div>
              <h3>待复核（{{ pendingCount }}）</h3>
              <div class="review-list">
                <div v-for="ticket in partialTickets" :key="'p' + ticket.no" class="review-item">
                  <span>领号#{{ ticket.no }} {{ ticket.summary }} —— 可续办，或从最近完整领号恢复</span>
                  <span class="badge bad">半份领号</span>
                </div>
                <div v-for="order in conflictOrders" :key="'c' + order.id" class="review-item">
                  <span>{{ orderLabel(order) }} —— 回传抢占罐车冲突，等待改派或取消占用</span>
                  <span class="badge bad">抢占冲突</span>
                </div>
                <div v-for="review in pendingReviewRecords" :key="'r' + review.id" class="review-item">
                  <span>{{ orderLabelById(review.orderId) }} —— {{ review.detail }}</span>
                  <span :class="reviewStateClass(review.state)">{{ review.state }}</span>
                </div>
                <div v-for="acceptance in unmatchedAcceptances" :key="'a' + acceptance.id" class="review-item">
                  <span>{{ orderLabelById(acceptance.orderId) }} —— 油库验收 {{ acceptance.acceptedTons }} 吨（领号#{{ acceptance.ticketNo }}），缺平板装车记录</span>
                  <span class="badge warn">缺平板记录</span>
                </div>
                <div v-if="pendingCount === 0" class="empty">暂无待复核事项</div>
              </div>
            </div>
            <div>
              <h3>库存缺口（{{ shortfalls.length }}）</h3>
              <div class="review-list">
                <div v-for="row in shortfalls" :key="row.station + row.fuel" class="review-item">
                  <span>{{ row.station }} / {{ row.fuel }} —— 现库存 {{ row.onHand }} 吨，未装车占用 {{ row.reserved }} 吨</span>
                  <span class="gap-text">缺 {{ row.gap }} 吨</span>
                </div>
                <div v-if="shortfalls.length === 0" class="empty">暂无缺口</div>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
