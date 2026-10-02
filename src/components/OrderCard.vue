<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDispatchStore, fmtTime } from "../store";
import type { DeliveryOrder } from "../types";

const props = defineProps<{ order: DeliveryOrder }>();
const store = useDispatchStore();

const selectedTruck = ref("");
const loadTons = ref(0);
const arriveTons = ref(0);

watch(
  () => [props.order.tons, props.order.loadedTons],
  () => {
    loadTons.value = Math.round((props.order.tons - props.order.loadedTons) * 100) / 100;
    arriveTons.value = props.order.loadedTons;
  },
  { immediate: true },
);

const truck = computed(() => store.getTruck(props.order.truckId));
const chain = computed(() => {
  const o = props.order;
  return [
    { label: "建单", ok: true },
    { label: "派车", ok: !!o.claimTicketId, id: o.claimTicketId },
    { label: "装车", ok: o.loadTicketIds.length > 0, id: o.loadTicketIds[o.loadTicketIds.length - 1] },
    { label: "发车", ok: !!o.departTicketId, id: o.departTicketId, basis: o.claimTicketId },
    { label: "到站", ok: !!o.arriveTicketId, id: o.arriveTicketId },
  ];
});

function ticket(id: string | null) {
  return id ? store.tickets.find((t) => t.id === id) : undefined;
}

const stageClass = computed(() => `stage-${props.order.stage}`);

const canConflict = computed(
  () => !!props.order.claimTicketId && props.order.stage !== "已发车" && props.order.stage !== "已到站",
);
const lastLoad = computed(() =>
  props.order.loadTicketIds.length
    ? store.tickets.find((t) => t.id === props.order.loadTicketIds[props.order.loadTicketIds.length - 1])
    : undefined,
);
</script>

<template>
  <article class="order-card" :class="stageClass">
    <div class="order-head">
      <div>
        <p class="order-code">{{ order.code }}</p>
        <p class="order-route">{{ order.station }} · {{ order.fuel }} · 计划 {{ order.tons }} 吨</p>
      </div>
      <span class="stage-badge">{{ order.stage }}</span>
    </div>

    <div class="order-meta">
      <span v-if="truck">罐车 <strong>{{ truck.plate }}</strong>（载 {{ truck.loadedTons }}/{{ truck.capacity }} 吨）</span>
      <span v-else class="muted">尚未派车</span>
      <span v-if="order.claimTicketId">首次确认 {{ fmtTime(order.firstConfirmAt) }}</span>
      <span>已装车 <strong :class="{ 'half': order.loadedTons > 0 && order.loadedTons < order.tons }">{{ order.loadedTons }}</strong>/ {{ order.tons }} 吨</span>
    </div>

    <div class="occupancy">
      <span class="occ reserved">未装车占用 {{ order.reservedTons }} 吨</span>
      <span v-if="order.shortTons > 0" class="occ short">缺口 {{ order.shortTons }} 吨</span>
      <span v-else-if="order.stage !== '已发车' && order.stage !== '已到站'" class="occ enough">库存足额</span>
      <span v-for="id in order.dirtyTicketIds" :key="id" class="occ dirty">待回传 {{ id }}</span>
    </div>

    <div class="chain">
      <template v-for="(step, i) in chain" :key="step.label">
        <span class="chain-step" :class="{ on: step.ok, basis: step.label === '发车' && step.ok }">
          {{ step.label }}
          <em v-if="step.id">{{ step.id }}</em>
          <em v-if="step.basis" class="basis-tag">依据 {{ step.basis }}</em>
        </span>
        <span v-if="i < chain.length - 1" class="chain-arrow">→</span>
      </template>
    </div>

    <div v-if="lastLoad && (!lastLoad.complete || lastLoad.needsRedo)" class="half-warn">
      装车领号 {{ lastLoad.id }} 为半份：{{ lastLoad.errorMsg }}
    </div>

    <div class="order-actions">
      <template v-if="order.stage === '待派车'">
        <select v-model="selectedTruck">
          <option value="" disabled>选择空闲罐车</option>
          <option v-for="t in store.idleTrucks" :key="t.id" :value="t.id">
            {{ t.plate }}（容量 {{ t.capacity }} 吨）
          </option>
        </select>
        <button :disabled="!selectedTruck" @click="store.assignTruck(order.id, selectedTruck)">
          领号派车{{ store.online ? "" : "（断网）" }}
        </button>
      </template>

      <template v-else-if="order.stage === '待装车' || order.stage === '装车中'">
        <input v-model.number="loadTons" type="number" min="0" step="0.5" class="tons-input" />
        <button @click="store.submitLoad(order.id, Number(loadTons) || 0, false)">提交装车</button>
        <button class="warn" @click="store.submitLoad(order.id, Number(loadTons) || 0, true)">提交失败（半份）</button>
      </template>

      <button v-if="order.stage === '待发车'" @click="store.depart(order.id)">
        领号发车（沿用 {{ order.claimTicketId }}）
      </button>

      <template v-if="order.stage === '已发车'">
        <input v-model.number="arriveTons" type="number" min="0" step="0.5" class="tons-input" />
        <button @click="store.arrive(order.id, Number(arriveTons) || 0)">到站确认（按验收吨数）</button>
      </template>

      <button v-if="canConflict" class="secondary" @click="store.simulateTruckConflict(order.id)">
        模拟同车抢占登记
      </button>
      <button
        v-if="lastLoad && lastLoad.complete && order.stage !== '已发车' && order.stage !== '已到站'"
        class="secondary"
        @click="store.simulateLoadDiff(order.id)"
      >
        模拟装车差异
      </button>
      <button class="danger ghost" @click="store.removeOrder(order.id)">删除</button>
    </div>
  </article>
</template>
