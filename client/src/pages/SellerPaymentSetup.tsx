import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Loader2, DollarSign, CheckCircle2, ArrowLeft, Smartphone, Building2, Wallet, ShieldCheck } from "lucide-react";

const paymentSetupSchema = z.object({
  payoutType: z.enum(["bank_account", "mobile_money"]),
  bankCode: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  mobileProvider: z.string().optional(),
  mobileNumber: z.string().optional(),
}).refine(
  (data) => {
    if (data.payoutType === "bank_account") {
      return !!data.bankCode && !!data.accountNumber && !!data.accountName;
    }
    if (data.payoutType === "mobile_money") {
      return !!data.mobileProvider && !!data.mobileNumber;
    }
    return true;
  },
  {
    message: "Please fill in all required fields for your selected payout method",
  }
);

type PaymentSetupFormData = z.infer<typeof paymentSetupSchema>;

interface Bank {
  id: number;
  name: string;
  code: string;
}

interface Store {
  id: string;
  name: string;
  primarySellerId: string;
  paystackSubaccountId?: string;
  payoutType?: "bank_account" | "mobile_money";
  payoutDetails?: {
    accountName?: string;
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    mobileNumber?: string;
    provider?: string;
  };
  isPayoutVerified?: boolean;
}

interface PublicPlatformSettings {
  allowSellerBankPayouts?: boolean;
}

function CollapsibleDashboardSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <details open={defaultOpen}>
        <summary className="cursor-pointer list-none px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
          </div>
        </summary>
        <CardContent className="pt-0">{children}</CardContent>
      </details>
    </Card>
  );
}

function hasCompletePayoutSetup(store?: Store | null) {
  if (!store?.paystackSubaccountId || !store?.isPayoutVerified) return false;
  if (store.payoutType === "bank_account") {
    return Boolean(
      store.payoutDetails?.bankCode &&
      store.payoutDetails?.bankName &&
      store.payoutDetails?.accountNumber &&
      store.payoutDetails?.accountName,
    );
  }
  if (store.payoutType === "mobile_money") {
    return Boolean(store.payoutDetails?.provider && store.payoutDetails?.mobileNumber);
  }
  return false;
}

export default function SellerPaymentSetup() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [payoutType, setPayoutType] = useState<"bank_account" | "mobile_money">("bank_account");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: store, isLoading: storeLoading } = useQuery<Store>({
    queryKey: ["/api/stores/my-store"],
    enabled: isAuthenticated && user?.role === "seller",
  });

  const { data: publicSettings } = useQuery<PublicPlatformSettings>({
    queryKey: ["/api/public/platform-settings", "seller-payout-options"],
    queryFn: async () => {
      const res = await fetch("/api/public/platform-settings", { credentials: "include" });
      if (!res.ok) {
        return {};
      }
      return res.json();
    },
  });

  const bankPayoutsAllowed = publicSettings?.allowSellerBankPayouts !== false;

  const { data: banks = [] } = useQuery<Bank[]>({
    queryKey: ["/api/paystack/banks"],
    enabled: payoutType === "bank_account",
  });

  const form = useForm<PaymentSetupFormData>({
    resolver: zodResolver(paymentSetupSchema),
    defaultValues: {
      payoutType: "bank_account",
      bankCode: "",
      accountNumber: "",
      accountName: "",
      mobileProvider: "",
      mobileNumber: "",
    },
  });

  useEffect(() => {
    if (!store) return;

    const nextPayoutType =
      store.payoutType === "mobile_money"
        ? "mobile_money"
        : store.payoutType === "bank_account"
          ? "bank_account"
          : bankPayoutsAllowed
            ? "bank_account"
            : "mobile_money";

    setPayoutType(nextPayoutType);
    setVerified(Boolean(store.isPayoutVerified));
    form.reset({
      payoutType: nextPayoutType,
      bankCode: store.payoutDetails?.bankCode || "",
      accountNumber: store.payoutDetails?.accountNumber || "",
      accountName: store.payoutDetails?.accountName || "",
      mobileProvider: store.payoutDetails?.provider || "",
      mobileNumber: store.payoutDetails?.mobileNumber || "",
    });
  }, [store, bankPayoutsAllowed, form]);

  useEffect(() => {
    if (!bankPayoutsAllowed && payoutType === "bank_account") {
      setPayoutType("mobile_money");
      form.setValue("payoutType", "mobile_money");
      setVerified(false);
    }
  }, [bankPayoutsAllowed, payoutType, form]);

  const verifyAccountMutation = useMutation({
    mutationFn: async (data: { accountNumber: string; bankCode: string }) => {
      const res = await apiRequest("POST", "/api/paystack/verify-account", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.accountName) {
        form.setValue("accountName", data.accountName);
        setVerified(true);
        toast({
          title: "Account Verified",
          description: `Account belongs to ${data.accountName}`,
        });
      }
    },
    onError: (error: any) => {
      // apiRequest throws the JSON response, so error.error contains the message
      const errorMsg = error.error || error.message || "Could not verify account. Please check details.";
      
      // Provide additional context based on error type
      let description = errorMsg;
      if (errorMsg.includes('timed out') || errorMsg.includes('internet')) {
        description = `${errorMsg} Make sure you have a stable internet connection.`;
      } else if (errorMsg.includes('Account not found') || errorMsg.includes('Invalid account')) {
        description = `${errorMsg} Double-check that you entered the correct 10-digit account number and selected the right bank.`;
      } else if (errorMsg.includes('Too many requests')) {
        description = `${errorMsg} You've made too many verification attempts. Please wait 1-2 minutes before trying again.`;
      }
      
      toast({
        title: "Verification Failed",
        description,
        variant: "destructive",
      });
    },
  });

  const setupPaymentMutation = useMutation({
    mutationFn: async (data: PaymentSetupFormData) => {
      if (!store?.id) {
        throw new Error("Store not found");
      }

      let payoutDetails: any = {};

      if (data.payoutType === "bank_account") {
        payoutDetails = {
          bankCode: data.bankCode,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          bankName: banks.find(b => b.code === data.bankCode)?.name,
        };
      } else {
        payoutDetails = {
          provider: data.mobileProvider,
          mobileNumber: data.mobileNumber,
        };
      }

      const res = await apiRequest("POST", `/api/stores/${store.id}/setup-paystack`, {
        payoutType: data.payoutType,
        payoutDetails,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
      toast({
        title: "Success",
        description: "Payment details set up successfully! You can now receive payments.",
      });
      setTimeout(() => navigate("/seller"), 1500);
    },
    onError: (error: any) => {
      // apiRequest throws the JSON response, so error.error contains the message
      const errorMsg = error.error || error.message || "Failed to set up payment details";
      
      // Provide additional context based on error type
      let title = "Setup Failed";
      let description = errorMsg;
      
      if (errorMsg.includes('already set up') || errorMsg.includes('already exist')) {
        title = "Account Already Configured";
        description = `${errorMsg} If you need to update your payment details, please contact support for assistance.`;
      } else if (errorMsg.includes('timed out') || errorMsg.includes('internet')) {
        description = `${errorMsg} Please ensure you have a stable internet connection and try again.`;
      } else if (errorMsg.includes('Invalid') || errorMsg.includes('verify')) {
        description = `${errorMsg} Please make sure you verified your account first and all details are correct.`;
      } else if (errorMsg.includes('temporarily unavailable')) {
        description = `${errorMsg} This is usually temporary. You can try again shortly or contact support if the issue persists.`;
      } else if (errorMsg.includes('authentication failed') || errorMsg.includes('contact support')) {
        title = "System Error";
        description = `${errorMsg} Our team has been notified and will resolve this soon.`;
      } else if (errorMsg.includes("malformed array literal")) {
        title = "Setup Saved Partially";
        description = "Your payout details were received, but the payout release step could not complete automatically. Please try again shortly.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const handleVerify = () => {
    const accountNumber = form.getValues("accountNumber");
    const bankCode = form.getValues("bankCode");

    if (!accountNumber || !bankCode) {
      toast({
        title: "Missing Information",
        description: "Please select a bank and enter account number",
        variant: "destructive",
      });
      return;
    }

    verifyAccountMutation.mutate({ accountNumber, bankCode });
  };

  const onSubmit = (data: PaymentSetupFormData) => {
    if (data.payoutType === "bank_account" && !verified) {
      toast({
        title: "Account Not Verified",
        description: "Please verify your bank account before submitting",
        variant: "destructive",
      });
      return;
    }

    if (!store?.id) {
      toast({
        title: "Store Not Found",
        description: "Unable to find your store. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (data.payoutType === "bank_account" && !bankPayoutsAllowed) {
      toast({
        title: "Bank Payouts Disabled",
        description: "Super admin has disabled bank account payouts. Please use mobile money.",
        variant: "destructive",
      });
      return;
    }

    setupPaymentMutation.mutate(data);
  };

  if (authLoading || storeLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading payout setup" description="Preparing your payout method, verification, and settlement settings." />;
  }

  if (!store) {
    return (
      <DashboardLayout role="seller">
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle>Store Not Found</CardTitle>
              <CardDescription>
                You need to have an active store before setting up payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/seller")} data-testid="button-back-dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
      <DashboardLayout role="seller">
      <div className="p-6 md:p-8" data-testid="page-seller-payment-setup">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-3xl border border-border/70 bg-card px-6 py-7 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Wallet className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-payment-setup">
                  <DollarSign className="h-8 w-8" />
                  Payment Setup
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Choose how you want to receive your money.
                </p>
              </div>
            </div>
          </div>

          {hasCompletePayoutSetup(store) && (
            <Card className="border-border/70 bg-card shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Current Payout Setup</CardTitle>
                <CardDescription>
                  Your saved payout method is active and ready for settlement.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Method</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {store.payoutType === "mobile_money" ? "Mobile Money" : "Bank Account"}
                  </p>
                </div>
                {store.payoutType === "mobile_money" ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Provider</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{store.payoutDetails?.provider || "Not set"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/50 p-4 sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Number</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{store.payoutDetails?.mobileNumber || "Not set"}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Bank</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{store.payoutDetails?.bankName || "Not set"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Account</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{store.payoutDetails?.accountNumber || "Not set"}</p>
                    </div>
                  </>
                )}
                {!bankPayoutsAllowed && (
                  <div className="sm:col-span-2 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Bank payouts are currently unavailable for new updates. Mobile money is active on this platform right now.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle>Choose Payment Method</CardTitle>
              <CardDescription>
                Pick the payout option you want to use.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <CollapsibleDashboardSection
                  title="How Seller Payout Setup Works"
                  summary="Expand to see the difference between checkout fees and your seller payout."
                >
                  <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      The Paystack checkout fee is charged during customer payment. Your seller payout is calculated separately from your order earnings.
                      {bankPayoutsAllowed
                        ? " Mobile money and bank payout options are both available when your details are valid."
                        : " Only mobile money payouts are currently enabled on this platform."}
                    </div>
                  </div>
                </CollapsibleDashboardSection>

                {!bankPayoutsAllowed && (
                  <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Bank transfer is currently disabled. Please use mobile money for payout.
                  </div>
                )}

                <div className="space-y-3">
                  <Label>Payment Method</Label>
                  <RadioGroup
                    value={payoutType}
                    onValueChange={(value) => {
                      setPayoutType(value as "bank_account" | "mobile_money");
                      form.setValue("payoutType", value as "bank_account" | "mobile_money");
                      setVerified(false);
                    }}
                    data-testid="radio-payout-type"
                    className="grid gap-3"
                  >
                    {bankPayoutsAllowed && (
                      <div className={`flex items-center space-x-3 rounded-2xl border p-4 transition-colors ${
                        payoutType === "bank_account"
                          ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                          : "border-border/70 bg-background/40 hover:border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/10"
                      }`}>
                        <RadioGroupItem value="bank_account" id="bank" data-testid="radio-bank-account" />
                        <Label htmlFor="bank" className="flex flex-1 items-center gap-3 font-normal cursor-pointer">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Bank Account</div>
                            <div className="text-sm text-muted-foreground">
                              Receive your money in your bank account.
                            </div>
                          </div>
                        </Label>
                      </div>
                    )}
                    <div className={`flex items-center space-x-3 rounded-2xl border p-4 transition-colors ${
                      payoutType === "mobile_money"
                        ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                        : "border-border/70 bg-background/40 hover:border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/10"
                    }`}>
                      <RadioGroupItem value="mobile_money" id="mobile" data-testid="radio-mobile-money" />
                      <Label htmlFor="mobile" className="flex items-center gap-3 font-normal cursor-pointer flex-1">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Mobile Money</div>
                          <div className="text-sm text-muted-foreground">Receive your money with MTN, Vodafone/Telecel, or AirtelTigo.</div>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {payoutType === "bank_account" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bankCode">Select Bank</Label>
                      <Select
                        value={form.watch("bankCode") || undefined}
                        onValueChange={(value) => {
                          form.setValue("bankCode", value);
                          setVerified(false);
                        }}
                      >
                        <SelectTrigger data-testid="select-bank">
                          <SelectValue placeholder="Choose your bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((bank) => (
                            <SelectItem key={bank.code} value={bank.code} data-testid={`bank-option-${bank.code}`}>
                              {bank.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <div className="flex gap-2">
                        <Input
                          id="accountNumber"
                          {...form.register("accountNumber")}
                          placeholder="0123456789"
                          data-testid="input-account-number"
                          onChange={() => setVerified(false)}
                        />
                        <Button
                          type="button"
                          onClick={handleVerify}
                          disabled={verifyAccountMutation.isPending || !form.getValues("accountNumber") || !form.getValues("bankCode")}
                          data-testid="button-verify-account"
                        >
                          {verifyAccountMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    </div>

                    {verified && form.getValues("accountName") && (
                      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                          <div>
                            <p className="font-medium text-foreground">Account Verified</p>
                            <p className="text-sm text-muted-foreground" data-testid="text-account-name">
                              {form.getValues("accountName")}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="mobileProvider">Mobile Money Provider</Label>
                      <Select
                        value={form.watch("mobileProvider") || undefined}
                        onValueChange={(value) => form.setValue("mobileProvider", value)}
                      >
                        <SelectTrigger data-testid="select-provider">
                          <SelectValue placeholder="Choose provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mtn" data-testid="provider-mtn">
                            MTN Mobile Money
                          </SelectItem>
                          <SelectItem value="vod" data-testid="provider-vodafone">
                            Vodafone Cash / Telecel
                          </SelectItem>
                          <SelectItem value="atl" data-testid="provider-airteltigo">
                            AirtelTigo Money
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mobileNumber">Mobile Number</Label>
                      <Input
                        id="mobileNumber"
                        {...form.register("mobileNumber")}
                        placeholder="0XXXXXXXXX"
                        data-testid="input-mobile-number"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the number linked to your mobile money account.
                      </p>
                    </div>
                  </>
                )}

                <div className="flex flex-wrap gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={setupPaymentMutation.isPending || (payoutType === "bank_account" && !verified)}
                    data-testid="button-submit-payment-setup"
                    className="gap-2"
                  >
                    {setupPaymentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        {hasCompletePayoutSetup(store) ? "Update Payment Details" : "Complete Setup"}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/seller")}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
