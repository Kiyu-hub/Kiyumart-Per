import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Video, Phone, Search, Loader2 } from "lucide-react";
import type { CallType } from "@/hooks/useGroupCall";
import UserAvatar from "@/components/UserAvatar";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage?: string | null;
}

interface ParticipantSelectorDialogProps {
  onStartCall: (participantIds: string[], callType: CallType) => void;
  currentUserId: string;
}

export function ParticipantSelectorDialog({
  onStartCall,
  currentUserId
}: ParticipantSelectorDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open
  });

  const filteredUsers = users
    .filter(user => user.id !== currentUserId)
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });

  const toggleSelection = (userId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleStartCall = (callType: CallType) => {
    if (selectedIds.size === 0) return;
    onStartCall(Array.from(selectedIds), callType);
    setOpen(false);
    setSelectedIds(new Set());
    setSearchQuery("");
    setRoleFilter("all");
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin":
      case "admin":
        return "default";
      case "seller":
        return "secondary";
      case "rider":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" data-testid="button-start-group-call">
          <Users className="h-4 w-4 mr-2" />
          Start Group Call
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Start Group Call</DialogTitle>
          <DialogDescription>
            Select participants to invite to the group call
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-participants"
            />
          </div>

          <Tabs value={roleFilter} onValueChange={setRoleFilter}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="buyer" data-testid="tab-buyers">Buyers</TabsTrigger>
              <TabsTrigger value="seller" data-testid="tab-sellers">Sellers</TabsTrigger>
              <TabsTrigger value="rider" data-testid="tab-riders">Riders</TabsTrigger>
              <TabsTrigger value="admin" data-testid="tab-admins">Staff</TabsTrigger>
            </TabsList>

            <TabsContent value={roleFilter} className="mt-4">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {filteredUsers.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8" data-testid="text-no-users">
                        No users found
                      </p>
                    ) : (
                      filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                          onClick={() => toggleSelection(user.id)}
                          data-testid={`user-item-${user.id}`}
                        >
                          <Checkbox
                            checked={selectedIds.has(user.id)}
                            onCheckedChange={() => toggleSelection(user.id)}
                            data-testid={`checkbox-${user.id}`}
                          />
                          <UserAvatar
                            profileImage={user.profileImage}
                            name={user.name}
                            email={user.email}
                            size="md"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user.name}</p>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Badge variant={getRoleBadgeVariant(user.role)} data-testid={`badge-role-${user.id}`}>
                            {user.role.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground" data-testid="text-selected-count">
              {selectedIds.size} participant{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleStartCall('voice')}
                disabled={selectedIds.size === 0}
                data-testid="button-start-voice-call"
              >
                <Phone className="h-4 w-4 mr-2" />
                Voice Call
              </Button>
              <Button
                onClick={() => handleStartCall('video')}
                disabled={selectedIds.size === 0}
                data-testid="button-start-video-call"
              >
                <Video className="h-4 w-4 mr-2" />
                Video Call
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
