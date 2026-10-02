<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { FUELS, STATIONS, type Fuel, type Station } from "./types";
import { useDispatchStore, fmtTime } from "./store";
import OrderCard from "./components/OrderCard.vue";

const store = useDispatchStore();

const filters = ["全部油站", ...STATIONS] as const;
const filter = ref<(typeof filters)[number]>("全部油站");

const form = reactive({
  station: "城东站" as Station,
  fuel: "92号汽油" as Fuel,
  tons: 10,
});

const adjust = reactive<Record<string, number>>({});
const adjustReason = ref("");

const showLedger = ref(false);

function adjKey(station: string, fuel: string) {
  return `${station}|${fuel}`;
}

const visibleOrders = computed(() =>
  filter.value === "全部油站" ? store.orders : store.orders.filter((o) => o.station === filter.value),
);

const metricCards = computed(() => [
  { label: "配送单", value: store.orders.length },
  { label: "待复核", value: store.pendingReviews.length, accent: store.pendingReviews.length > 0 },
  { label: "库存缺口单", value: store.gapOrders.length, accent: store.gapOrders.length > 0 },
  { label: "待回传领号", value: store.dirtyCount, accent: store.dirtyCount > 0 },
]);

const reviewKindLabel: Record<string, string> = {
  车辆抢占: "车辆抢占",
  装车差异: "装车差异",
  验收待对: "验收待对",
  半份恢复: "半份恢复",
  油库调账: "油库调账",
};

function orderCode(id?: string) {
  return store.orders.find((o) => o.id === id)?.code ?? "—";
}

function createOrder() {
  if (!form.tons || form.tons <= 0) {
    store.toast("error", "配送吨数需大于 0");
    return;
  }
  store.createOrder({ station: form.station, fuel: form.fuel, tons: Number(form.tons) });
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <!-- 顶部 -->
      <header class="topbar">
        <div>
          <p class="eyebrow">石油 · 汛期断网调运</p>
          <h1>油品配送 · 领号续办调度台</h1>
          <p class="subtitle">
            配送单、油罐车、油站库存统一挂“领号”流水：断网可派车，回网按油库验收结果与平板待复核记录对账；
            提交失败从最近完整领号恢复，已发车单据沿用首次确认依据；库存一变，未装车占用按新库存重算。
          </p>
        </div>
        <div class="conn-box">
          <div class="net-state" :class="store.online ? 'on' : 'off'">
            <span class="dot" />{{ store.online ? "在线（可回传）" : "断网（现场续办）" }}
          </div>
          <label class="switch">
            <input type="checkbox" :checked="store.online" @change="store.setOnline(!store.online)" />
            <span>切换网络</span>
          </label>
          <button class="primary big" @click="store.pullDepotAndReconcile()">
            拉取油库验收结果并对账
          </button>
          <button class="ghost" @click="store.resetAll()">重置演示数据</button>
        </div>
      </header>

      <!-- 指标 -->
      <section class="metrics">
        <article v-for="m in metricCards" :key="m.label" class="metric" :class="{ hot: m.accent }">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <div class="layout">
        <!-- 左列：建单 + 库存 -->
        <div class="col-left">
          <form class="panel" @submit.prevent="createOrder">
            <h2>新建配送单（先领号）</h2>
            <label>目标油站
              <select v-model="form.station">
                <option v-for="s in STATIONS" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label>油品
              <select v-model="form.fuel">
                <option v-for="f in FUELS" :key="f" :value="f">{{ f }}</option>
              </select>
            </label>
            <label>计划吨数
              <input v-model.number="form.tons" type="number" min="1" step="0.5" />
            </label>
            <button class="primary" type="submit">领号建单</button>
            <p class="hint">建单即产生“建单”领号；断网时进待回传队列，不影响继续操作。</p>
          </form>

          <section class="panel">
            <h2>油库库存（验收权威数据）</h2>
            <div class="inv-table">
              <div class="inv-row inv-head">
                <span>油站 / 油品</span>
                <span v-for="f in FUELS" :key="f">{{ f }}</span>
              </div>
              <div v-for="row in store.inventoryRows" :key="row.station" class="inv-row">
                <span class="inv-station">{{ row.station }}</span>
                <div v-for="cell in row.cells" :key="cell.fuel" class="inv-cell">
                  <p :class="{ neg: cell.free < 0 }">
                    <strong>{{ cell.stock }}</strong> 吨
                  </p>
                  <p class="inv-sub">占用 {{ cell.reserved }} / 可拨 {{ cell.free }}</p>
                  <div class="inv-adj">
                    <input v-model.number="adjust[adjKey(row.station, cell.fuel)]" type="number" step="1" placeholder="±吨数" />
                    <button
                      @click="
                        store.adjustStock(
                          row.station as Station,
                          cell.fuel as Fuel,
                          Number(adjust[adjKey(row.station, cell.fuel)]) || 0,
                          adjustReason,
                        );
                        adjust[adjKey(row.station, cell.fuel)] = undefined;
                      "
                    >
                      调整
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <input v-model="adjustReason" class="reason-input" placeholder="调账原因（可选），如：油库补验收入库" />
            <p class="hint">库存一变，所有“未装车”单据的占用与缺口立即按新库存重算。</p>
          </section>
        </div>

        <!-- 右列：待复核 + 缺口 + 单据 -->
        <div class="col-right">
          <section class="panel review-panel">
            <div class="panel-head">
              <h2>平板待复核记录</h2>
              <span class="count">{{ store.pendingReviews.length }} 笔待对账</span>
            </div>
            <div v-if="store.pendingReviews.length === 0" class="empty-line">暂无待复核，油库验收与平板记录一致。</div>
            <div v-for="r in store.pendingReviews" :key="r.id" class="review pending">
              <div class="review-main">
                <span class="tag-kind" :data-kind="r.kind">{{ reviewKindLabel[r.kind] }}</span>
                <div>
                  <p class="review-msg">{{ r.message }}</p>
                  <p class="review-sub">{{ orderCode(r.orderId) }} · {{ fmtTime(r.at) }}</p>
                </div>
              </div>
              <div class="review-ops">
                <button v-if="r.kind === '半份恢复'" class="warn" @click="store.recoverHalfLoad(r.id)">
                  从最近完整领号恢复
                </button>
                <button class="secondary" @click="store.pullDepotAndReconcile()">拉取油库结果对账</button>
              </div>
            </div>
          </section>

          <section class="panel gap-panel">
            <div class="panel-head">
              <h2>库存缺口清单</h2>
              <span class="count">{{ store.gapOrders.length }} 单</span>
            </div>
            <div v-if="store.gapOrders.length === 0" class="empty-line">未装车需求均被库存覆盖，暂无缺口。</div>
            <div v-for="o in store.gapOrders" :key="o.id" class="gap-row">
              <span>{{ o.code }}</span>
              <span>{{ o.station }} · {{ o.fuel }}</span>
              <span>占用 {{ o.reservedTons }} 吨</span>
              <strong class="gap-num">缺 {{ o.shortTons }} 吨</strong>
            </div>
          </section>

          <section class="panel orders-panel">
            <div class="panel-head">
              <h2>配送单（领号续办）</h2>
              <select v-model="filter" class="filter-select">
                <option v-for="f in filters" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
            <div v-if="visibleOrders.length === 0" class="empty-line">该油站暂无配送单。</div>
            <OrderCard v-for="o in visibleOrders" :key="o.id" :order="o" />
          </section>
        </div>
      </div>

      <!-- 阶段分布 -->
      <section class="panel chart-panel">
        <h2>单据阶段分布</h2>
        <div class="bar-row">
          <div v-for="s in store.stageStats" :key="s.stage" class="bar-item">
            <span class="bar-label">{{ s.stage }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: `${(s.value / Math.max(1, store.orders.length)) * 100}%` }" />
            </div>
            <strong>{{ s.value }}</strong>
          </div>
        </div>
      </section>

      <!-- 已对账记录 -->
      <section v-if="store.resolvedReviews.length" class="panel">
        <div class="panel-head">
          <h2>已对账记录</h2>
          <span class="count muted-count">{{ store.resolvedReviews.length }} 笔</span>
        </div>
        <div v-for="r in store.resolvedReviews" :key="r.id" class="review resolved">
          <span class="tag-kind done" :data-kind="r.kind">{{ reviewKindLabel[r.kind] }}</span>
          <div>
            <p class="review-msg">{{ r.message }}</p>
            <p class="review-res">{{ r.resolution }}</p>
          </div>
        </div>
      </section>

      <!-- 领号台账 -->
      <section class="panel ledger-panel">
        <div class="panel-head">
          <h2>领号流水台账</h2>
          <button class="ghost" @click="showLedger = !showLedger">{{ showLedger ? "收起" : "展开" }}</button>
        </div>
        <div v-if="showLedger" class="ledger">
          <div v-for="t in store.tickets" :key="t.id" class="ledger-row" :class="{ unsynced: !t.synced, half: !t.complete }">
            <span class="tk-id">{{ t.id }}</span>
            <span class="tk-kind">{{ t.kind }}</span>
            <span>{{ fmtTime(t.at) }}</span>
            <span>{{ t.offline ? "断网领取" : "在线领取" }}</span>
            <span :class="t.synced ? 'sync-yes' : 'sync-no'">{{ t.synced ? "已回传" : "待回传" }}</span>
            <span v-if="t.basisTicketId" class="basis-line">依据 {{ t.basisTicketId }}</span>
            <span class="tk-note">{{ t.note }}</span>
            <span v-if="t.depot" class="depot-line">油库：{{ t.depot.message }}</span>
            <span v-if="t.errorMsg" class="err-line">{{ t.errorMsg }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Toast -->
    <div class="toast-wrap">
      <div v-for="t in store.toasts" :key="t.id" class="toast" :data-type="t.type">{{ t.text }}</div>
    </div>
  </main>
</template>
