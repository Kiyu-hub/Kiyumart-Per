import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApiJson, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldCheck, LockKeyhole, ArrowLeft, AlertTriangle, Layers } from "lucide-react";

interface CatalogDepartment {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  storeTypes: string[];
  isEnabled: boolean;
  launchReady: boolean;
  displayOrder: number;
}

export default function AdminCatalogDepartments() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  // Step-up credential is ephemeral and held in component memory only.
  const [elevatedToken, setElevatedToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState(0);
  const unlocked = Boolean(elevatedToken && Date.now() < tokenExpiresAt);

  const { data: departments = [], isLoading, isError } = useQuery<CatalogDepartment[]>({
    queryKey: ["/api/admin/catalog-departments"],
    enabled: isAuthenticated && user?.role === "super_admin",
  });

  const unlockMutation = useMutation({
    mutationFn: (currentPassword: string) =>
      fetchApiJson<{ elevatedToken: string; expiresInSeconds: number }>(
        "/api/admin/catalog-departments/elevate",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: currentPassword }) },
      ),
    onSuccess: ({ elevatedToken, expiresInSeconds }) => {
      setPassword("");
      setElevatedToken(elevatedToken);
      setTokenExpiresAt(Date.now() + expiresInSeconds * 1000);
      toast({ title: "Elevated permissions verified", description: "Department controls are unlocked for up to ten minutes." });
    },
    onError: (error: Error) => {
      setPassword("");
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ slug, isEnabled }: { slug: string; isEnabled: boolean }) => {
      if (!elevatedToken || Date.now() >= tokenExpiresAt) {
        throw new Error("Your elevated session expired; verify your password again.");
      }
      return fetchApiJson("/api/admin/catalog-departments/" + encodeURIComponent(slug), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Elevated-Access": elevatedToken },
        body: JSON.stringify({ isEnabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/catalog-departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog-departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Marketplace department updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Update blocked", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading || !isAuthenticated || user?.role !== "super_admin") {
    return <div className="min-h-screen flex items-center justify-center p-6"><p className="text-muted-foreground">Super Admin access required</p></div>;
  }

  return (
    <DashboardLayout role="super_admin">
      <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-6" data-testid="catalog-departments-manager">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/categories")} aria-label="Back to categories"><ArrowLeft /></Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Layers className="w-7 h-7" /> Marketplace Departments</h1>
            <p className="text-sm text-muted-foreground mt-1">Clothing & Fashion is the default. Unlock future departments only when their features are ready.</p>
          </div>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Elevated Super Admin Permission</CardTitle>
            <CardDescription>Editing departments requires your current Super Admin password and a fresh ten-minute authorization. This does not affect your normal dashboard access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unlocked ? (
              <div className="flex gap-3 items-center flex-wrap">
                <span className="text-sm font-medium text-primary">Unlocked for the current session</span>
                <Button variant="outline" onClick={() => { setElevatedToken(""); setTokenExpiresAt(0); }}>Lock now</Button>
              </div>
            ) : (
              <form className="flex gap-2 items-end flex-wrap" onSubmit={(e) => {
                e.preventDefault(); unlockMutation.mutate(password);
              }}>
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label htmlFor="catalog-stepup-password">Current password</Label>
                  <Input id="catalog-stepup-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Super Admin password" required />
                </div>
                <Button type="submit" disabled={!password || unlockMutation.isPending}>
                  {unlockMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LockKeyhole className="w-4 h-4 mr-2" />}
                  Verify & unlock
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marketplace Supercategories</CardTitle>
            <CardDescription>Only enabled, launch-ready departments can appear to shoppers. Hidden departments remain saved for future expansion. Enabling a category does not automatically build its missing product or seller features.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin w-4 h-4" /> Loading departments…</p>}
            {isError && <p className="text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Could not load departments. The category migration may still need to be applied.</p>}
            {!isLoading && !isError && <div className="divide-y">
              {departments.map((department) => {
                const lockedForDevelopment = !department.launchReady;
                const isPermanentDefault = department.slug === "clothing";
                const canToggle = unlocked && !toggleMutation.isPending && !lockedForDevelopment && !isPermanentDefault;
                return (
                  <div key={department.id} className="flex gap-3 items-center py-4" data-testid={"department-" + department.slug}>
                    <span className="text-2xl" aria-hidden="true">{department.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{department.name}</h3>
                      <p className="text-xs text-muted-foreground">{department.description}</p>
                      <p className="text-xs mt-1">
                        {isPermanentDefault ? <span className="text-primary font-medium">Default fashion department</span>
                          : lockedForDevelopment ? <span className="text-amber-600">Locked until expansion workflows are validated</span>
                          : department.isEnabled ? <span className="text-primary">Live</span>
                          : <span className="text-muted-foreground">Hidden</span>}
                      </p>
                    </div>
                    <Switch aria-label={"Enable " + department.name} checked={department.isEnabled} disabled={!canToggle}
                      onCheckedChange={(checked) => toggleMutation.mutate({ slug: department.slug, isEnabled: checked })} />
                  </div>
                );
              })}
            </div>}
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
