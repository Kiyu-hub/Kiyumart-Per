import { useState, useEffect } from "react";
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
import { Loader2, DollarSign, CheckCircle2, ArrowLeft, Smartphone, Building2 } from "lucide-react";

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
}

export default function SellerPaymentSetup() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [payoutType, setPayoutType] = useState<"bank_account" | "mobile_money">("bank_account");
  const [verifying, setVerifying] = useState(false);
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

    setVerifying(true);
    verifyAccountMutation.mutate({ accountNumber, bankCode });
    setVerifying(false);
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

  if (store.paystackSubaccountId) {
    return (
      <DashboardLayout role="seller">
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle>Payment Setup Complete</CardTitle>
              <CardDescription>
                Your payment details are already configured
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
      <div className="p-8" data-testid="page-seller-payment-setup">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-payment-setup">
              <DollarSign className="h-8 w-8" />
              Payment Setup
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure your payment details to receive earnings from sales
            </p>
          </div>

            <Card>
              <CardHeader>
                <CardTitle>Choose Payment Method</CardTitle>
                <CardDescription>
                  Select how you want to receive payments for your sales
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="rounded-xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                    Checkout processing fees are charged separately to the customer as the Paystack payment fee. Seller settlement remains separate, and Paystack payout cost references are GHS 1 for mobile money and GHS 8 for bank transfers.
                  </div>

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
                  >
                    <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="bank_account" id="bank" data-testid="radio-bank-account" />
                      <Label htmlFor="bank" className="flex items-center gap-2 font-normal cursor-pointer flex-1">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Bank Account</div>
                          <div className="text-sm text-muted-foreground">Receive payments to your bank account. Reference payout cost: GHS 8 when a bank transfer is used.</div>
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="mobile_money" id="mobile" data-testid="radio-mobile-money" />
                      <Label htmlFor="mobile" className="flex items-center gap-2 font-normal cursor-pointer flex-1">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Mobile Money</div>
                          <div className="text-sm text-muted-foreground">MTN, Vodafone/Telecel, AirtelTigo. Paystack transfer cost: GHS 1 per successful payout.</div>
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
                          disabled={verifying || !form.getValues("accountNumber") || !form.getValues("bankCode")}
                          data-testid="button-verify-account"
                        >
                          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    </div>

                    {verified && form.getValues("accountName") && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-medium text-green-900 dark:text-green-100">Account Verified</p>
                            <p className="text-sm text-green-700 dark:text-green-300" data-testid="text-account-name">
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
                      <Select onValueChange={(value) => form.setValue("mobileProvider", value)}>
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
                          <SelectItem value="atm" data-testid="provider-airteltigo">
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
                        Enter the mobile number registered for mobile money
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={setupPaymentMutation.isPending || (payoutType === "bank_account" && !verified)}
                    data-testid="button-submit-payment-setup"
                    className="gap-2"
                  >
                    {setupPaymentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Setting Up...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Complete Setup
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
