import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, MapPin, CheckCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Delivery {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddress?: string;
  buyer?: {
    name?: string;
    phone?: string;
  };
  createdAt: string;
}

export default function RiderDeliveries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: deliveries = [], isLoading } = useQuery<Delivery[]>({
    queryKey: ["/api/orders?context=rider"],
    queryFn: async () => {
      const res = await fetch("/api/orders?context=rider", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
  });

  const normalizeStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "ready_for_pickup") return "assigned";
    if (s === "assigned_to_rider") return "assigned";
    if (s === "out_for_delivery" || s === "in_transit") return "en_route";
    return s || "pending";
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/orders/${id}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Delivery status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders?context=rider"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredDeliveries = statusFilter === "all" 
    ? deliveries 
    : deliveries.filter(d => normalizeStatus(d.status) === statusFilter);

  const getStatusColor = (status: string) => {
    switch (normalizeStatus(status)) {
      case "pending": return "bg-yellow-500";
      case "assigned": return "bg-blue-500";
      case "picked_up": return "bg-purple-500";
      case "en_route": return "bg-orange-500";
      case "delivered": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <DashboardLayout role="rider">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Deliveries</h1>
            <p className="text-muted-foreground">Manage your delivery assignments</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Deliveries</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="picked_up">Picked Up</SelectItem>
              <SelectItem value="en_route">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredDeliveries.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No deliveries</h3>
              <p className="text-muted-foreground">
                {statusFilter === "all" ? "You have no assigned deliveries" : `No ${statusFilter} deliveries`}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredDeliveries.map((delivery) => (
              <Card key={delivery.id} className="p-4" data-testid={`card-delivery-${delivery.id}`}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Order #{delivery.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">{delivery.buyer?.name || "Customer"}</p>
                      </div>
                    </div>
                    <Badge className={`${getStatusColor(delivery.status)} text-white`}>
                      {normalizeStatus(delivery.status).replace("_", " ")}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-red-500" />
                      <div>
                        <p className="font-medium">Delivery</p>
                        <p className="text-muted-foreground">{delivery.deliveryAddress || "N/A"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {normalizeStatus(delivery.status) === "assigned" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: delivery.id, status: "picked_up" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-pickup-${delivery.id}`}
                      >
                        Mark as Picked Up
                      </Button>
                    )}
                    {normalizeStatus(delivery.status) === "picked_up" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: delivery.id, status: "en_route" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-intransit-${delivery.id}`}
                      >
                        Mark as En Route
                      </Button>
                    )}
                    {normalizeStatus(delivery.status) === "en_route" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: delivery.id, status: "delivered" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-deliver-${delivery.id}`}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Delivered
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
