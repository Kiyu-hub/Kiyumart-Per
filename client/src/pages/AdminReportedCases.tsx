import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle, Clock, Eye, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ReportedCase {
  id: string;
  reporterId: string;
  reporterRole: string;
  reporterName: string | null;
  reporterEmail: string | null;
  subject: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved" | "closed";
  adminNotes: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-700 border-blue-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-700 border-amber-200",
  in_review: "bg-blue-100 text-blue-700 border-blue-200",
  resolved: "bg-green-100 text-green-700 border-green-200",
  closed: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function AdminReportedCases() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ReportedCase | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const { data: cases = [], isLoading } = useQuery<ReportedCase[]>({
    queryKey: ["/api/admin/reported-cases"],
    queryFn: () => fetchApiJson<ReportedCase[]>("/api/admin/reported-cases"),
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; adminNotes?: string }) =>
      fetchApiJson(`/api/admin/reported-cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reported-cases"] });
      toast({ title: "Case updated" });
      setSelected(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openCase = (c: ReportedCase) => {
    setSelected(c);
    setAdminNotes(c.adminNotes || "");
    setNewStatus(c.status);
  };

  const filtered = cases.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterPriority !== "all" && c.priority !== filterPriority) return false;
    return true;
  });

  const counts = {
    open: cases.filter(c => c.status === "open").length,
    critical: cases.filter(c => c.priority === "critical").length,
    resolved: cases.filter(c => c.status === "resolved").length,
  };

  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return <DashboardLayout role={(user?.role as any) || "admin"}><div className="p-8 text-muted-foreground">Access denied.</div></DashboardLayout>;
  }

  return (
    <DashboardLayout role={(user.role as any) || "admin"}>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-destructive" />
          <h1 className="text-2xl font-bold">Reported Cases</h1>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-500" />
              <div><div className="text-2xl font-bold">{counts.open}</div><div className="text-xs text-muted-foreground">Open</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div><div className="text-2xl font-bold">{counts.critical}</div><div className="text-xs text-muted-foreground">Critical</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div><div className="text-2xl font-bold">{counts.resolved}</div><div className="text-xs text-muted-foreground">Resolved</div></div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground py-12 text-center">Loading cases…</div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">No cases found.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase ${PRIORITY_COLORS[c.priority]}`}>
                        {c.priority}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status]}`}>
                        {c.status.replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{c.reporterRole.replace("_", " ")}</span>
                    </div>
                    <div className="font-semibold text-sm truncate">{c.subject}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.reporterName || c.reporterEmail} · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openCase(c)} className="shrink-0">
                    <Eye className="h-4 w-4 mr-1" /> Review
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase ${selected ? PRIORITY_COLORS[selected.priority] : ""}`}>
                {selected?.priority}
              </span>
              Case Details
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">From</div>
                <div className="text-sm font-medium">{selected.reporterName} ({selected.reporterRole.replace("_", " ")})</div>
                <div className="text-xs text-muted-foreground">{selected.reporterEmail}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Subject</div>
                <div className="font-semibold">{selected.subject}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Description</div>
                <div className="text-sm whitespace-pre-wrap bg-muted rounded-md p-3">{selected.description}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Admin Notes</div>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes or resolution details…"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({ id: selected.id, status: newStatus, adminNotes })}
                  disabled={updateMutation.isPending}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
