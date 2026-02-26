import type { Order } from "@shared/schema";

export type CanonicalOrderStatus =
  | "created"
  | "searching_rider"
  | "confirmed"
  | "ready"
  | "processing"
  | "assigned"
  | "rider_arrived"
  | "picked_up"
  | "in_transit"
  | "en_route"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";
// Legacy aliases accepted as input for backward compatibility.
export type OrderStatus = CanonicalOrderStatus | "delivering" | "pending";
export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";
export type UserRole = "super_admin" | "admin" | "seller" | "buyer" | "rider" | "agent";

export interface TransitionContext {
  order: Order;
  targetStatus: OrderStatus;
  actorId: string;
  actorRole: UserRole;
  reason?: string;
}

export interface TransitionRule {
  allowedRoles: UserRole[];
  preconditions: Array<(ctx: TransitionContext) => { valid: boolean; error?: string }>;
  sideEffects?: Array<(order: Order) => Partial<Order>>;
}

export interface TransitionError {
  code: "invalid_transition" | "role_violation" | "precondition_failed" | "payment_required";
  message: string;
  details?: Record<string, any>;
}

export function canonicalizeOrderStatus(status?: string | null): CanonicalOrderStatus {
  const s = (status || "").toLowerCase().trim();
  if (s === "pending") return "created";
  if (s === "created") return "created";
  if (s === "ready_for_pickup") return "ready";
  if (s === "assigned_to_rider") return "assigned";
  if (s === "out_for_delivery") return "en_route";
  if (s === "delivering") return "en_route";
  if (s === "in_transit") return "in_transit";
  if (!s) return "created";
  return s as CanonicalOrderStatus;
}

export function toStorageOrderStatus(status: OrderStatus): string {
  const normalized = canonicalizeOrderStatus(status);
  if (normalized === "created") return "pending";
  return normalized;
}

const TRANSITION_RULES: Record<CanonicalOrderStatus, Partial<Record<CanonicalOrderStatus, TransitionRule>>> = {
  created: {
    searching_rider: {
      allowedRoles: ["admin", "super_admin", "seller"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before rider matching starts",
        }),
      ],
      sideEffects: [],
    },
    confirmed: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    processing: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before processing order",
        }),
      ],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["buyer", "seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  confirmed: {
    searching_rider: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before rider matching starts",
        }),
      ],
      sideEffects: [],
    },
    ready: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    processing: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    completed: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.deliveryMethod === "pickup",
          error: "Only pickup orders can complete directly from confirmed status",
        }),
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before pickup completion",
        }),
      ],
      sideEffects: [(order) => ({ deliveredAt: order.deliveredAt || new Date() })],
    },
    cancelled: {
      allowedRoles: ["buyer", "seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  ready: {
    searching_rider: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before rider matching starts",
        }),
      ],
      sideEffects: [],
    },
    processing: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    completed: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.deliveryMethod === "pickup",
          error: "Only pickup orders can complete directly from ready status",
        }),
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before pickup completion",
        }),
      ],
      sideEffects: [(order) => ({ deliveredAt: order.deliveredAt || new Date() })],
    },
    cancelled: {
      allowedRoles: ["buyer", "seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  processing: {
    searching_rider: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before rider matching starts",
        }),
      ],
      sideEffects: [],
    },
    assigned: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: !!ctx.order.riderId,
          error: "Rider must be assigned before moving order to assigned status",
        }),
      ],
      sideEffects: [],
    },
    en_route: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: !!ctx.order.riderId,
          error: "Rider must be assigned before delivery can begin",
        }),
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before delivery",
        }),
      ],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
    disputed: {
      allowedRoles: ["buyer", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    completed: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: ctx.order.deliveryMethod === "pickup",
          error: "Only pickup orders can complete directly from processing status",
        }),
        (ctx) => ({
          valid: ctx.order.paymentStatus === "completed",
          error: "Payment must be completed before pickup completion",
        }),
      ],
      sideEffects: [(order) => ({ deliveredAt: order.deliveredAt || new Date() })],
    },
  },

  assigned: {
    rider_arrived: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can mark as arrived",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    picked_up: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can mark as picked up",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
  },

  picked_up: {
    in_transit: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can mark order in transit",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    en_route: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can mark order en route",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    delivered: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ deliveredAt: new Date() })],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
  },

  en_route: {
    delivered: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ deliveredAt: new Date() })],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
  },

  searching_rider: {
    assigned: {
      allowedRoles: ["rider", "seller", "admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: !!ctx.order.riderId,
          error: "Rider must be attached before assignment confirmation",
        }),
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the offered rider can accept assignment",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["buyer", "seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
  },

  rider_arrived: {
    picked_up: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can mark as picked up",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
  },

  in_transit: {
    en_route: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    delivered: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ deliveredAt: new Date() })],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
  },

  delivered: {
    completed: {
      allowedRoles: ["admin", "super_admin", "rider"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can complete this delivery",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [],
    },
    disputed: {
      allowedRoles: ["buyer", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  cancelled: {},

  completed: {},

  disputed: {
    delivered: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: !!ctx.reason,
          error: "Reason required to resolve dispute and mark as delivered",
        }),
      ],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [
        (ctx) => ({
          valid: !!ctx.reason,
          error: "Reason required to resolve dispute and cancel order",
        }),
      ],
      sideEffects: [],
    },
  },
};

export function getAllowedTransitions(order: Order, actorRole: UserRole): OrderStatus[] {
  const currentStatus = canonicalizeOrderStatus(order.status);
  const transitions = TRANSITION_RULES[currentStatus] || {};

  return Object.entries(transitions)
    .filter(([_, rule]) => rule.allowedRoles.includes(actorRole))
    .map(([status]) => status as OrderStatus);
}

export function assertCanTransition(
  ctx: TransitionContext
): { valid: true } | { valid: false; error: TransitionError } {
  const currentStatus = canonicalizeOrderStatus(ctx.order.status);
  const normalizedTarget = canonicalizeOrderStatus(ctx.targetStatus);

  const transitions = TRANSITION_RULES[currentStatus];
  if (!transitions || !transitions[normalizedTarget]) {
    return {
      valid: false,
      error: {
        code: "invalid_transition",
        message: `Cannot transition from ${currentStatus} to ${normalizedTarget}`,
        details: { currentStatus, targetStatus: normalizedTarget },
      },
    };
  }

  const rule = transitions[normalizedTarget]!;

  if (!rule.allowedRoles.includes(ctx.actorRole)) {
    return {
      valid: false,
      error: {
        code: "role_violation",
        message: `Role ${ctx.actorRole} is not permitted to transition order from ${currentStatus} to ${normalizedTarget}`,
        details: {
          currentStatus,
          targetStatus: normalizedTarget,
          actorRole: ctx.actorRole,
          allowedRoles: rule.allowedRoles,
        },
      },
    };
  }

  for (const precondition of rule.preconditions) {
    const result = precondition(ctx);
    if (!result.valid) {
      return {
        valid: false,
        error: {
          code: "precondition_failed",
          message: result.error || "Precondition not met",
          details: { currentStatus, targetStatus: normalizedTarget },
        },
      };
    }
  }

  return { valid: true };
}

export function getTransitionSideEffects(order: Order, targetStatus: OrderStatus): Partial<Order> {
  const currentStatus = canonicalizeOrderStatus(order.status);
  const normalizedTarget = canonicalizeOrderStatus(targetStatus);
  const transitions = TRANSITION_RULES[currentStatus];

  if (!transitions || !transitions[normalizedTarget]) {
    return {};
  }

  const rule = transitions[normalizedTarget]!;
  const sideEffects = rule.sideEffects || [];

  return sideEffects.reduce(
    (acc, effect) => ({
      ...acc,
      ...effect(order),
    }),
    {}
  );
}
