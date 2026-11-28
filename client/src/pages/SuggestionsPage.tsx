import { useState } from "react";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { SubpageShell, SubpageLabel, SubpagePrimary, subpageColors, useSubpageDark } from "@/components/mobile/MobileSubpage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Send, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Suggestion {
  id: string;
  message: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export default function SuggestionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const { isMobile } = useMobileDevice();
  const isDarkSub = useSubpageDark();

  const { data: suggestions = [], isLoading } = useQuery<Suggestion[]>({
    queryKey: ["/api/suggestions/my"],
    queryFn: () => fetchApiJson<Suggestion[]>("/api/suggestions/my"),
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: (msg: string) =>
      fetchApiJson("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/suggestions/my"] });
      setMessage("");
      toast({ title: "Suggestion sent", description: "The Kiyumart Team will review your suggestion." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!message.trim()) return;
    submitMutation.mutate(message.trim());
  };

  // Phone: approved phone layout (desktop below is unchanged).
  if (isMobile) {
    const c = subpageColors(isDarkSub);
    return (
      <SubpageShell title="Suggestions" isDark={isDarkSub} testId="mobile-suggestions">
        <p style={{ margin: "8px 24px 0", fontSize: 14, color: c.soft, lineHeight: 1.5 }}>Share ideas or feedback with the KiyuMart team.</p>
        <div style={{ padding: "16px 24px 0" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>
            Your suggestion
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your suggestion or feedback here…"
              maxLength={1000}
              style={{ height: 140, boxSizing: "border-box", border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 16, resize: "none", color: c.ink, background: c.field, fontFamily: "inherit", outline: "none" }}
            />
            <span style={{ fontSize: 12, color: c.faint, fontWeight: 400, textAlign: "right" }}>{message.length} / 1000</span>
          </label>
        </div>
        <SubpagePrimary onClick={handleSubmit} disabled={!message.trim() || submitMutation.isPending} top={12}>
          {submitMutation.isPending ? "Sending…" : "Send suggestion"}
        </SubpagePrimary>
        <SubpageLabel isDark={isDarkSub}>Your previous suggestions</SubpageLabel>
        <div style={{ padding: "0 24px" }}>
          {isLoading ? (
            <p style={{ color: c.soft, fontSize: 14, padding: "16px 0" }}>Loading…</p>
          ) : suggestions.length === 0 ? (
            <p style={{ color: c.soft, fontSize: 14, padding: "16px 0" }}>No suggestions yet. Be the first to share!</p>
          ) : (
            suggestions.map((sg, i) => (
              <div key={sg.id} style={{ padding: "14px 0", borderBottom: i === suggestions.length - 1 ? "none" : `1px solid ${c.line}` }}>
                <div style={{ fontSize: 15, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{sg.message}</div>
                <div style={{ fontSize: 12, color: c.faint, marginTop: 6 }}>
                  {formatDistanceToNow(new Date(sg.createdAt), { addSuffix: true })} · {sg.reply ? "Replied" : "Pending review"}
                </div>
                {sg.reply && (
                  <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${c.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: c.soft }}>KiyuMart team</div>
                    <div style={{ fontSize: 14, marginTop: 2, lineHeight: 1.4 }}>{sg.reply}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </SubpageShell>
    );
  }

  return (
    <DashboardLayout role={(user?.role as any) || "buyer"}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-6 w-6 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold">Suggestions</h1>
            <p className="text-sm text-muted-foreground">Share ideas or feedback with the Kiyumart Team</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your suggestion or feedback here…"
              rows={4}
              maxLength={1000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{message.length}/1000</span>
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || submitMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Suggestion
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Your Previous Suggestions</h2>
          {isLoading ? (
            <div className="text-muted-foreground text-sm py-6 text-center">Loading…</div>
          ) : suggestions.length === 0 ? (
            <div className="text-muted-foreground text-sm py-6 text-center">No suggestions yet. Be the first to share!</div>
          ) : (
            suggestions.map(s => (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm whitespace-pre-wrap">{s.message}</div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {s.reply && (
                    <div className="border-l-4 border-primary pl-3 bg-primary/5 rounded-r-md p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3 text-primary" />
                        <span className="text-xs font-semibold text-primary">Kiyumart Team</span>
                        {s.repliedAt && (
                          <span className="text-xs text-muted-foreground">
                            · {formatDistanceToNow(new Date(s.repliedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{s.reply}</p>
                    </div>
                  )}
                  {!s.reply && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Pending review</Badge>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
