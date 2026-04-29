import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AdminSuggestion {
  id: string;
  userId: string;
  userRole: string;
  userName: string | null;
  userEmail: string | null;
  message: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  buyer: "Buyer", seller: "Seller", rider: "Rider",
  agent: "Customer Agent", pickup_agent: "Pickup Agent",
  admin: "Admin", super_admin: "Super Admin",
};

export default function AdminSuggestions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AdminSuggestion | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: suggestions = [], isLoading } = useQuery<AdminSuggestion[]>({
    queryKey: ["/api/admin/suggestions"],
    queryFn: () => fetchApiJson<AdminSuggestion[]>("/api/admin/suggestions"),
    refetchInterval: 30_000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      fetchApiJson(`/api/admin/suggestions/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/suggestions"] });
      toast({ title: "Reply sent", description: "User will be notified as 'Kiyumart Team'." });
      setSelected(null);
      setReplyText("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return <DashboardLayout role={(user?.role as any) || "admin"}><div className="p-8 text-muted-foreground">Access denied.</div></DashboardLayout>;
  }

  const openReply = (s: AdminSuggestion) => {
    setSelected(s);
    setReplyText(s.reply || "");
  };

  return (
    <DashboardLayout role={(user.role as any) || "admin"}>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-6 w-6 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold">Suggestions Inbox</h1>
            <p className="text-sm text-muted-foreground">Replies appear to users as "Kiyumart Team"</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground py-12 text-center">Loading…</div>
        ) : suggestions.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">No suggestions yet.</div>
        ) : (
          <div className="space-y-3">
            {suggestions.map(s => (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{ROLE_LABEL[s.userRole] || s.userRole}</Badge>
                    {s.reply ? (
                      <Badge className="text-xs bg-green-100 text-green-700 border-green-200">Replied</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pending</Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{s.userName} · {s.userEmail}</div>
                  <p className="text-sm whitespace-pre-wrap">{s.message}</p>
                  {s.reply && (
                    <div className="border-l-4 border-primary pl-3 bg-primary/5 rounded-r-md p-2 text-sm">
                      <span className="font-semibold text-primary text-xs">Kiyumart Team: </span>
                      {s.reply}
                    </div>
                  )}
                  {user.role === "super_admin" && (
                    <Button size="sm" variant="outline" onClick={() => openReply(s)}>
                      <Reply className="h-3 w-3 mr-1" /> {s.reply ? "Edit Reply" : "Reply"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reply as Kiyumart Team</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">{selected.message}</div>
              <Textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type your reply…"
                rows={4}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                <Button
                  onClick={() => replyMutation.mutate({ id: selected.id, reply: replyText })}
                  disabled={!replyText.trim() || replyMutation.isPending}
                >
                  Send Reply
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
