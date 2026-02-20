import type { Order } from "@shared/schema";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "ready"
  | "processing"
  | "assigned"
  | "picked_up"
  | "en_route"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "disputed";
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

function normalizeOrderStatus(status?: string | null): OrderStatus {
  const s = (status || "").toLowerCase().trim();
  if (s === "ready_for_pickup") return "ready";
  if (s === "assigned_to_rider") return "assigned";
  if (s === "out_for_delivery" || s === "in_transit") return "en_route";
  if (!s) return "pending";
  return s as OrderStatus;
}

const TRANSITION_RULES: Record<OrderStatus, Partial<Record<OrderStatus, TransitionRule>>> = {
  pending: {
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
    cancelled: {
      allowedRoles: ["buyer", "seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  ready: {
    processing: {
      allowedRoles: ["seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
    cancelled: {
      allowedRoles: ["buyer", "seller", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  processing: {
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
    delivering: {
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
  },

  assigned: {
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
  },

  en_route: {
    delivered: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ deliveredAt: new Date() })],
    },
  },

  delivering: {
    delivered: {
      allowedRoles: ["rider", "admin", "super_admin"],
      preconditions: [
        (ctx) => {
          if (ctx.actorRole === "rider") {
            return {
              valid: ctx.order.riderId === ctx.actorId,
              error: "Only the assigned rider can mark this order as delivered",
            };
          }
          return { valid: true };
        },
      ],
      sideEffects: [(order) => ({ deliveredAt: new Date() })],
    },
    cancelled: {
      allowedRoles: ["admin", "super_admin"],
      preconditions: [],
      sideEffects: [(order) => ({ riderId: null })],
    },
    disputed: {
      allowedRoles: ["buyer", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  delivered: {
    disputed: {
      allowedRoles: ["buyer", "admin", "super_admin"],
      preconditions: [],
      sideEffects: [],
    },
  },

  cancelled: {},

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
  const currentStatus = normalizeOrderStatus(order.status);
  const transitions = TRANSITION_RULES[currentStatus] || {};

  return Object.entries(transitions)
    .filter(([_, rule]) => rule.allowedRoles.includes(actorRole))
    .map(([status]) => status as OrderStatus);
}

export function assertCanTransition(
  ctx: TransitionContext
): { valid: true } | { valid: false; error: TransitionError } {
  const currentStatus = normalizeOrderStatus(ctx.order.status);
  const normalizedTarget = normalizeOrderStatus(ctx.targetStatus);

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
  const currentStatus = normalizeOrderStatus(order.status);
  const normalizedTarget = normalizeOrderStatus(targetStatus);
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
