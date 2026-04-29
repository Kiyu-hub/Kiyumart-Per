import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, CheckCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ReportedCase {
  id: string;
  subject: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved" | "closed";
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_review: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

export default function ReportCasePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const submitMutation = useMutation({
    mutationFn: () =>
      fetchApiJson("/api/report-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, priority }),
      }),
    onSuccess: () => {
      toast({ title: "Case Reported", description: "Your report has been sent privately to the admin team." });
      setSubject("");
      setDescription("");
      setPriority("medium");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!subject.trim() || !description.trim()) {
      toast({ title: "Required", description: "Please fill in subject and description.", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  if (!user || !["agent", "pickup_agent"].includes(user.role)) {
    return <DashboardLayout role={(user?.role as any) || "agent"}><div className="p-8 text-muted-foreground">Access denied.</div></DashboardLayout>;
  }

  return (
    <DashboardLayout role={(user.role as any) || "agent"}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Flag className="h-6 w-6 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Report a Case</h1>
            <p className="text-sm text-muted-foreground">Private — only admins and super admins can see this</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Submit a New Report</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief description of the issue…"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — Minor issue</SelectItem>
                  <SelectItem value="medium">Medium — Needs attention</SelectItem>
                  <SelectItem value="high">High — Urgent</SelectItem>
                  <SelectItem value="critical">Critical — Immediate action needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Provide full details of the case…"
                rows={6}
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-full bg-destructive hover:bg-destructive/90"
            >
              <Flag className="h-4 w-4 mr-2" />
              Submit Report
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
