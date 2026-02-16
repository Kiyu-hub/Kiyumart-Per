import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Tag, Trash2, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";

const couponSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters"),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid value"),
  minPurchase: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount").optional(),
  maxUses: z.string().regex(/^\d+$/, "Must be a number").optional(),
  expiresAt: z.string().optional(),
});

type CouponFormData = z.infer<typeof couponSchema>;

export default function SellerCoupons() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["/api/coupons", "seller"],
    queryFn: async () => {
      const res = await fetch("/api/coupons");
      if (!res.ok) throw new Error("Failed to fetch coupons");
      return res.json();
    },
  });

  const form = useForm<CouponFormData>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code: "",
      discountType: "percentage",
      discountValue: "",
      minPurchase: "",
      maxUses: "",
      expiresAt: "",
    },
  });

  const createCouponMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      return apiRequest("POST", "/api/coupons", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Coupon created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coupons/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Coupon deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
    },
  });

  return (
    <DashboardLayout role="seller">
      <div className="container mx-auto max-w-5xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Coupons</h1>
            <p className="text-muted-foreground">Create and manage discount coupons</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <div>
              <Button data-testid="button-create-coupon" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Coupon
              </Button>
            </div>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Coupon</DialogTitle>
                <DialogDescription>Add a new discount coupon for your products</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createCouponMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Coupon Code</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="SUMMER2024" data-testid="input-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="discountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-discount-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage</SelectItem>
                            <SelectItem value="fixed">Fixed Amount</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="discountValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Value</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="10" data-testid="input-discount-value" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createCouponMutation.isPending} data-testid="button-submit">
                    {createCouponMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Coupon
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : coupons.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No coupons yet</h3>
              <p className="text-muted-foreground">Create your first coupon to offer discounts</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {coupons.map((coupon: any) => (
              <Card key={coupon.id} className="p-4" data-testid={`card-coupon-${coupon.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-lg">{coupon.code}</p>
                    <p className="text-sm text-muted-foreground">
                      {coupon.discountType === "percentage" ? `${coupon.discountValue}% off` : `$${coupon.discountValue} off`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteCouponMutation.mutate(coupon.id)}
                    data-testid={`button-delete-${coupon.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
