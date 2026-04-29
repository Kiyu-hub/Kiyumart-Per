import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Flag } from "lucide-react";

interface ReportCaseDialogProps {
  trigger?: React.ReactNode;
}

export default function ReportCaseDialog({ trigger }: ReportCaseDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
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
      toast({
        title: "Case Reported",
        description: "Your report has been sent to the admin team privately.",
      });
      setOpen(false);
      setSubject("");
      setDescription("");
      setPriority("medium");
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!subject.trim() || !description.trim()) {
      toast({ title: "Required", description: "Please fill in subject and description.", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
            <Flag className="h-4 w-4" />
            Report a Case
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Report a Case
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          This report is private and will only be visible to admins and super admins.
        </p>
        <div className="space-y-4">
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
              rows={5}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Submit Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
