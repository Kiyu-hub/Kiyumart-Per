import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Bug, AlertTriangle, Users, Clock, Search, Sparkles,
  CheckCheck, ChevronDown, ChevronRight, RefreshCw, ExternalLink, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  type: string;
  status: string;
  level: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  metadata: { value?: string; type?: string; filename?: string };
  shortId: string;
  permalink: string;
  platform: string;
}

interface AiFix {
  file: string;
  explanation: string;
  originalCode?: string;
  fixedCode?: string;
  safe: boolean;
  confidence: "high" | "medium" | "low";
  resolvedFilePath?: string;
}

const levelColor: Record<string, string> = {
  fatal: "bg-destructive/10 text-destructive border-destructive/30",
  error: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  info: "bg-sky-500/10 text-sky-600 border-sky-500/30",
};

function IssueRow({ issue }: { issue: SentryIssue }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [aiFix, setAiFix] = useState<AiFix | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const aiFixMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/sentry-ai-fix", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issue.title,
          culprit: issue.culprit,
          issueType: issue.type,
          stacktrace: issue.metadata?.value ?? issue.culprit,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "AI fix failed");
      return d.fix as AiFix;
    },
    onSuccess: (fix) => { setAiFix(fix); setExpanded(true); },
    onError: (e: any) => toast({ title: "AI fix failed", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!aiFix) throw new Error("No fix available");
      const r = await fetch("/api/admin/apply-fix", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: aiFix.file, originalCode: aiFix.originalCode, fixedCode: aiFix.fixedCode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Apply failed");
      return d;
    },
    onSuccess: (d) => {
      setApplyResult(`Fix applied to ${d.file}${d.redeployTriggered ? " · Redeploy triggered" : " · Restart to see changes"}`);
      toast({ title: "Fix applied", description: `Saved to ${d.file}` });
    },
    onError: (e: any) => toast({ title: "Apply failed", description: e.message, variant: "destructive" }),
  });

  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <Card className="border-border/70">
      <div
        className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((o) => !o)}
      >
        <div className="mt-0.5 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge className={cn("border text-[10px] px-1.5 py-0 h-4", levelColor[issue.level] ?? levelColor.error)}>
              {issue.level.toUpperCase()}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">{issue.type}</span>
          </div>
          <p className="font-medium text-sm leading-snug truncate">{issue.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{issue.culprit}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Bug className="h-3 w-3" />
              {Number(issue.count).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {issue.userCount}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relTime(issue.lastSeen)}
          </div>
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 border-t space-y-4 px-5 pb-5">
          <div className="grid gap-2 sm:grid-cols-2 mt-3 text-xs">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-muted-foreground">First seen</p>
              <p className="font-medium">{new Date(issue.firstSeen).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-muted-foreground">Last seen</p>
              <p className="font-medium">{new Date(issue.lastSeen).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-muted-foreground">Platform</p>
              <p className="font-medium">{issue.platform}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-muted-foreground">Issue ID</p>
              <p className="font-mono font-medium">{issue.shortId}</p>
            </div>
          </div>

          {issue.metadata?.value && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {issue.metadata.value}
            </div>
          )}

          {issue.permalink && (
            <a
              href={issue.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View in Sentry
            </a>
          )}

          {/* AI Fix section */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">AI-Suggested Fix</p>
              </div>
              {!aiFix && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); aiFixMutation.mutate(); }}
                  disabled={aiFixMutation.isPending}
                  className="text-xs h-7"
                >
                  {aiFixMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Generate Fix
                </Button>
              )}
            </div>

            {aiFixMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing error and generating fix…
              </div>
            )}

            {aiFix && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">{aiFix.file || "unknown file"}</Badge>
                  <Badge className={cn("text-xs", aiFix.confidence === "high" ? "bg-emerald-500/10 text-emerald-700 border-emerald-300" : aiFix.confidence === "medium" ? "bg-amber-500/10 text-amber-700 border-amber-300" : "bg-muted text-muted-foreground")}>
                    {aiFix.confidence} confidence
                  </Badge>
                  {aiFix.safe && <Badge className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-300">Auto-apply safe</Badge>}
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">{aiFix.explanation}</p>

                {aiFix.originalCode && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Original code</p>
                    <pre className="rounded-lg bg-muted/60 border px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{aiFix.originalCode}</pre>
                  </div>
                )}

                {aiFix.fixedCode && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Fixed code</p>
                    <pre className="rounded-lg bg-emerald-500/5 border border-emerald-300/40 px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-foreground">{aiFix.fixedCode}</pre>
                  </div>
                )}

                {applyResult ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-300/40 px-3 py-2 text-sm text-emerald-700">
                    <CheckCheck className="h-4 w-4 shrink-0" />
                    {applyResult}
                  </div>
                ) : (
                  aiFix.fixedCode && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); applyMutation.mutate(); }}
                        disabled={applyMutation.isPending || !aiFix.safe}
                        className="text-xs h-7"
                      >
                        {applyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCheck className="h-3 w-3 mr-1" />}
                        Apply Fix
                      </Button>
                      {!aiFix.safe && (
                        <p className="text-xs text-muted-foreground self-center">Manual review recommended — apply confidence is low</p>
                      )}
                    </div>
                  )
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); setAiFix(null); aiFixMutation.reset(); }}
                  className="text-xs h-7 text-muted-foreground"
                >
                  Regenerate
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function AdminSentryIssues() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery<{
    configured: boolean;
    message?: string;
    issues?: SentryIssue[];
    project?: any;
    error?: string;
  }>({
    queryKey: ["/api/admin/sentry-issues"],
    queryFn: async () => {
      const r = await fetch("/api/admin/sentry-issues", { credentials: "include" });
      return r.json();
    },
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 100_000,
  });

  const issues = (data?.issues ?? []).filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.title.toLowerCase().includes(q) || i.culprit.toLowerCase().includes(q) || i.type.toLowerCase().includes(q);
  });

  const byLevel = issues.reduce((acc, i) => {
    acc[i.level] = (acc[i.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <DashboardLayout role={user?.role === "super_admin" ? "super_admin" : "admin"}>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bug className="h-6 w-6 text-primary" />
              Error Monitoring
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live Sentry issues with AI-powered fix suggestions
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 self-start rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !data?.configured ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-6 flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold">Sentry Not Configured</p>
                <p className="text-sm text-muted-foreground">{data?.message}</p>
                <div className="text-xs font-mono bg-muted rounded-lg p-3 space-y-1">
                  <p>SENTRY_AUTH_TOKEN=your_token_here</p>
                  <p>SENTRY_ORG=your-org-slug</p>
                  <p>SENTRY_PROJECT=your-project-slug</p>
                </div>
                <p className="text-xs text-muted-foreground">Add these as environment variables in your Render dashboard, then restart the service.</p>
              </div>
            </CardContent>
          </Card>
        ) : data?.error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm">{data.error}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/70">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Issues</p>
                  <p className="text-2xl font-bold mt-1">{data?.issues?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Unresolved</p>
                </CardContent>
              </Card>
              {["fatal", "error", "warning"].map((level) => (
                <Card key={level} className="border-border/70">
                  <CardContent className="p-5">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{level}</p>
                    <p className="text-2xl font-bold mt-1">{byLevel[level] ?? 0}</p>
                    <p className="text-xs text-muted-foreground capitalize">{level} issues</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, culprit, or type…"
                className="pl-9"
              />
            </div>

            {/* Issues list */}
            {issues.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>No issues found{search ? " matching your search" : ""}.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
