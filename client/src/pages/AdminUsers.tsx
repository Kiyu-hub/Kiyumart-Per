import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Search, Edit, Ban, MessageSquare, Trash2, ArrowLeft, CheckCircle, XCircle, UserCog, Phone, Video, KeyRound, Crown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import { JitsiCallDialog } from "@/components/JitsiCallDialog";
import UserAvatar from "@/components/UserAvatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { getRoleDisplayName } from "@/lib/roleLabels";

interface UserData {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  profileImage?: string | null;
  isActive: boolean;
  isApproved: boolean;
  isPremiumSeller?: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  
  const [confirmBanUser, setConfirmBanUser] = useState<{ id: string; name: string; isActive: boolean } | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; name: string } | null>(null);
  const [activeCallTarget, setActiveCallTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<UserData | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const jitsiCall = useJitsiCall(user?.id || "");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: users = [], isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/users/${userId}/status`, { isActive: !isActive });
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Success",
        description: variables.isActive ? "User has been banned successfully" : "User has been activated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setConfirmBanUser(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
      setConfirmBanUser(null);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User has been permanently deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setConfirmDeleteUser(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
      setConfirmDeleteUser(null);
    },
  });

  const togglePremiumMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("PATCH", `/api/users/${userId}/toggle-premium-seller`, {});
    },
    onSuccess: (_data, userId) => {
      const target = users.find(u => u.id === userId);
      const nowPremium = !target?.isPremiumSeller;
      toast({
        title: nowPremium ? "Premium Activated" : "Premium Removed",
        description: nowPremium
          ? "Seller upgraded to Premium — unlimited listings enabled."
          : "Seller returned to free tier.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update premium status", variant: "destructive" });
    },
  });

  const handleBanUser = (userData: UserData) => {
    setConfirmBanUser({
      id: userData.id,
      name: userData.name || userData.username,
      isActive: userData.isActive,
    });
  };

  const handleDeleteUser = (userData: UserData) => {
    setConfirmDeleteUser({
      id: userData.id,
      name: userData.name || userData.username,
    });
  };

  const confirmBanAction = () => {
    if (confirmBanUser) {
      toggleUserStatusMutation.mutate({
        userId: confirmBanUser.id,
        isActive: confirmBanUser.isActive,
      });
    }
  };

  const confirmDeleteAction = () => {
    if (confirmDeleteUser) {
      deleteUserMutation.mutate(confirmDeleteUser.id);
    }
  };

  const startJitsiCall = async (target: UserData, callType: "voice" | "video") => {
    try {
      setActiveCallTarget({ id: target.id, name: target.name || target.username });
      await jitsiCall.startCall(target.id, callType);
    } catch {
      // Errors are surfaced by useJitsiCall toasts.
      setActiveCallTarget(null);
    }
  };

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [userToChangeRole, setUserToChangeRole] = useState<UserData | null>(null);
  const [targetRole, setTargetRole] = useState<string>("buyer");

  const ROLE_WEIGHT: Record<string, number> = {
    buyer: 1,
    seller: 2,
    rider: 2,
    pickup_agent: 2,
    agent: 3,
    admin: 4,
    super_admin: 5,
  };

  const getAvailableRoleOptions = () => {
    if (user?.role === "super_admin") {
      return showInternalRiderFeatures ? ["buyer", "seller", "rider", "pickup_agent", "agent", "admin", "super_admin"] : ["buyer", "seller", "pickup_agent", "agent", "admin", "super_admin"];
    }
    return showInternalRiderFeatures ? ["buyer", "seller", "rider", "pickup_agent", "agent", "admin"] : ["buyer", "seller", "pickup_agent", "agent", "admin"];
  };

  const getRoleChangeDirection = (fromRole: string, toRole: string) => {
    const from = ROLE_WEIGHT[fromRole] ?? 0;
    const to = ROLE_WEIGHT[toRole] ?? 0;
    if (to > from) return "promoted";
    if (to < from) return "demoted";
    return "updated";
  };

  const changeUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, { role });
    },
    onSuccess: (_data, variables) => {
      const direction = getRoleChangeDirection(userToChangeRole?.role || "", variables.role);
      toast({
        title: "Success",
        description:
          direction === "promoted"
            ? "User promoted successfully"
            : direction === "demoted"
              ? "User demoted successfully"
              : "User role updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      if (user?.id === variables.userId) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
      setRoleDialogOpen(false);
      setUserToChangeRole(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return apiRequest("POST", `/api/users/${userId}/reset-password`, { password });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Password reset",
        description: `Password updated for ${resetPasswordTarget?.name || resetPasswordTarget?.username || "the user"}.`,
      });
      setResetPasswordTarget(null);
      setResetPasswordValue("");
      setResetPasswordConfirm("");
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const filterUsersByRole = (users: UserData[], role: string) => {
    if (role === "all") return users;
    return users.filter(u => u.role === role);
  };

  const filterUsersByStatus = (users: UserData[], status: string) => {
    if (status === "all") return users;
    if (status === "active") return users.filter(u => u.isActive);
    if (status === "inactive") return users.filter(u => !u.isActive);
    return users;
  };

  const filterUsersBySearch = (users: UserData[], query: string) => {
    if (!query) return users;
    const lowerQuery = query.toLowerCase();
    return users.filter(u => 
      (u.username?.toLowerCase() || '').includes(lowerQuery) ||
      (u.name?.toLowerCase() || '').includes(lowerQuery) ||
      (u.email?.toLowerCase() || '').includes(lowerQuery)
    );
  };

  const filteredUsers = filterUsersBySearch(
    filterUsersByStatus(
      filterUsersByRole(showInternalRiderFeatures ? users : users.filter((u) => u.role !== "rider"), selectedRole),
      selectedStatus
    ),
    searchQuery
  );

  useEffect(() => {
    if (!showInternalRiderFeatures && selectedRole === "rider") {
      setSelectedRole("all");
    }
  }, [selectedRole, showInternalRiderFeatures]);

  const getRoleBadgeColor = (role: string) => {
    switch(role.toLowerCase()) {
      case "admin": return "bg-purple-500 text-white";
      case "seller": return "bg-blue-500 text-white";
      case "buyer": return "bg-green-500 text-white";
      case "rider": return "bg-orange-500 text-white";
      case "pickup_agent": return "bg-cyan-500 text-white";
      case "agent": return "bg-pink-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const getUserDetailPath = (userData: UserData) => {
    switch (userData.role) {
      case "buyer":
        return `/admin/users/${userData.id}`;
      case "seller":
        return `/admin/sellers/${userData.id}`;
      default:
        return null;
    }
  };

  const rolesCounts = {
    all: (showInternalRiderFeatures ? users : users.filter((u) => u.role !== "rider")).length,
    admin: users.filter(u => u.role === "admin").length,
    seller: users.filter(u => u.role === "seller").length,
    buyer: users.filter(u => u.role === "buyer").length,
    rider: showInternalRiderFeatures ? users.filter(u => u.role === "rider").length : 0,
    pickup_agent: users.filter(u => u.role === "pickup_agent").length,
    agent: users.filter(u => u.role === "agent").length,
  };

  const UserCard = ({ userData }: { userData: UserData }) => {
    const detailPath = getUserDetailPath(userData);

    return (
    <Card
      className={`p-4 ${detailPath ? "cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/20" : ""}`}
      data-testid={`card-user-${userData.id}`}
      onClick={() => {
        if (detailPath) {
          navigate(detailPath);
        }
      }}
    >
      <div className="flex items-center gap-4">
        <UserAvatar
          profileImage={userData.profileImage}
          name={userData.name || userData.username}
          email={userData.email}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate" data-testid={`text-username-${userData.id}`}>
            {userData.name || userData.username}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground truncate" data-testid={`text-email-${userData.id}`}>
              {userData.email}
            </span>
            <Badge className={getRoleBadgeColor(userData.role)} data-testid={`badge-role-${userData.id}`}>
              {getRoleDisplayName(userData.role)}
            </Badge>
            {userData.isActive ? (
              <Badge className="bg-green-500 text-white flex items-center gap-1" data-testid={`badge-status-${userData.id}`}>
                <CheckCircle className="h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="destructive" className="flex items-center gap-1" data-testid={`badge-status-${userData.id}`}>
                <XCircle className="h-3 w-3" />
                Inactive
              </Badge>
            )}
            {(userData.role === "seller" || (showInternalRiderFeatures && userData.role === "rider")) && (
              userData.isApproved ? (
                <Badge className="bg-emerald-500 text-white" data-testid={`badge-approval-${userData.id}`}>
                  Approved
                </Badge>
              ) : (
                <Badge className="bg-yellow-500 text-white" data-testid={`badge-approval-${userData.id}`}>
                  Pending
                </Badge>
              )
            )}
            {userData.role === "seller" && userData.isPremiumSeller && (
              <Badge className="bg-amber-500 text-white flex items-center gap-1">
                <Crown className="h-3 w-3" />
                Premium
              </Badge>
            )}
            <span className="text-xs text-muted-foreground" data-testid={`text-joined-${userData.id}`}>
              Joined {new Date(userData.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
          {user?.role === "super_admin" && (
            <Button
              variant="ghost"
              size="icon"
              data-testid={`button-change-role-${userData.id}`}
              title="Promote / demote role"
              onClick={() => {
                setUserToChangeRole(userData);
                setTargetRole(userData.role);
                setRoleDialogOpen(true);
              }}
            >
              <UserCog className="h-4 w-4 text-primary" />
            </Button>
          )}
          {(user?.role === "admin" || user?.role === "super_admin") && userData.role === "seller" && (
            <Button
              variant="ghost"
              size="icon"
              title={userData.isPremiumSeller ? "Remove Premium status" : "Grant Premium Seller (unlimited listings)"}
              disabled={togglePremiumMutation.isPending}
              onClick={() => togglePremiumMutation.mutate(userData.id)}
            >
              <Crown className={`h-4 w-4 ${userData.isPremiumSeller ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void startJitsiCall(userData, "voice")}
            data-testid={`button-call-voice-${userData.id}`}
            title="Start voice call"
            disabled={jitsiCall.isStarting || jitsiCall.isJoining}
          >
            <Phone className="h-4 w-4 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void startJitsiCall(userData, "video")}
            data-testid={`button-call-video-${userData.id}`}
            title="Start video call"
            disabled={jitsiCall.isStarting || jitsiCall.isJoining}
          >
            <Video className="h-4 w-4 text-primary" />
          </Button>
          {user?.role === "super_admin" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/admin/users/${userData.id}/edit`)}
              data-testid={`button-edit-${userData.id}`}
              title="Edit user"
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {user?.role === "super_admin" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setResetPasswordTarget(userData);
                setResetPasswordValue("");
                setResetPasswordConfirm("");
              }}
              data-testid={`button-reset-password-${userData.id}`}
              title="Reset password"
            >
              <KeyRound className="h-4 w-4 text-primary" />
            </Button>
          )}
          {user?.role === "super_admin" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleBanUser(userData)}
              disabled={toggleUserStatusMutation.isPending}
              data-testid={`button-ban-${userData.id}`}
              title={userData.isActive ? "Ban user" : "Activate user"}
            >
              <Ban className="h-4 w-4" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate(`/admin/messages?userId=${userData.id}`)}
            data-testid={`button-message-${userData.id}`}
            title="Send message"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          {user?.role === "super_admin" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteUser(userData)}
              disabled={deleteUserMutation.isPending}
              data-testid={`button-delete-${userData.id}`}
              title="Delete user"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-users">Users Management</h1>
              <p className="text-muted-foreground mt-1">
                {showInternalRiderFeatures ? "Manage platform users and roles" : "Manage platform users and non-rider roles"}
              </p>
            </div>
            <div className="flex gap-2">
              {user?.role === "super_admin" && (
                <Button
                  onClick={() => navigate("/admin/users/create")}
                  data-testid="button-add-account"
                  className="gap-2"
                >
                  <UserCog className="h-4 w-4" />
                  Add an Account
                </Button>
              )}
            </div>
          </div>

          <div className="mb-6 space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs value={selectedRole} onValueChange={setSelectedRole} className="w-full">
            <TabsList className={`grid w-full mb-6 ${showInternalRiderFeatures ? "grid-cols-7" : "grid-cols-6"}`} data-testid="tabs-role-filter">
              <TabsTrigger value="all" data-testid="tab-all">
                All Users ({rolesCounts.all})
              </TabsTrigger>
              <TabsTrigger value="admin" data-testid="tab-admin">
                Admins ({rolesCounts.admin})
              </TabsTrigger>
              <TabsTrigger value="seller" data-testid="tab-seller">
                Sellers ({rolesCounts.seller})
              </TabsTrigger>
              <TabsTrigger value="buyer" data-testid="tab-buyer">
                Buyers ({rolesCounts.buyer})
              </TabsTrigger>
              {showInternalRiderFeatures ? <TabsTrigger value="rider" data-testid="tab-rider">
                Riders ({rolesCounts.rider})
              </TabsTrigger> : null}
              <TabsTrigger value="pickup_agent" data-testid="tab-pickup-agent">
                Pickup Agents ({rolesCounts.pickup_agent})
              </TabsTrigger>
              <TabsTrigger value="agent" data-testid="tab-agent">
                Customer Agents ({rolesCounts.agent})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedRole}>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredUsers.map((userData) => (
                    <UserCard key={userData.id} userData={userData} />
                  ))}
                  
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground" data-testid="text-no-users">
                        No users found matching your filters
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

      {/* Ban/Activate Confirmation Dialog */}
      <AlertDialog open={!!confirmBanUser} onOpenChange={(open) => !open && setConfirmBanUser(null)}>
        <AlertDialogContent data-testid="dialog-confirm-ban">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBanUser?.isActive ? "Ban User" : "Activate User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBanUser?.isActive 
                ? `Are you sure you want to ban ${confirmBanUser?.name}? They will no longer be able to access the platform.`
                : `Are you sure you want to activate ${confirmBanUser?.name}? They will be able to access the platform again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-ban">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBanAction}
              data-testid="button-confirm-ban"
              className={confirmBanUser?.isActive ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {toggleUserStatusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {confirmBanUser?.isActive ? "Ban User" : "Activate User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote / Demote Role Dialog */}
      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open);
          if (!open) setUserToChangeRole(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update User Role</DialogTitle>
            <DialogDescription>
              Change role for {userToChangeRole?.name || userToChangeRole?.username}. The user will receive an in-app notification about this role change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Current role: <span className="font-semibold text-foreground">{userToChangeRole?.role || "N/A"}</span>
            </div>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger data-testid="select-target-role">
                <SelectValue placeholder="Select target role" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableRoleOptions().map((role) => (
                  <SelectItem key={role} value={role}>
                    {getRoleDisplayName(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!userToChangeRole) return;
                changeUserRoleMutation.mutate({ userId: userToChangeRole.id, role: targetRole });
              }}
              disabled={!userToChangeRole || changeUserRoleMutation.isPending || userToChangeRole.role === targetRole}
              data-testid="button-confirm-change-role"
            >
              {changeUserRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!confirmDeleteUser} onOpenChange={(open) => !open && setConfirmDeleteUser(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {confirmDeleteUser?.name}? This will remove their account and all related data (products, orders, messages, etc.) from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteAction}
              data-testid="button-confirm-delete"
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!resetPasswordTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordTarget(null);
            setResetPasswordValue("");
            setResetPasswordConfirm("");
          }
        }}
      >
        <DialogContent data-testid="dialog-reset-password">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordTarget?.name || resetPasswordTarget?.username || "this user"}.
              The user will be notified of the reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              As super admin you can set any password with a minimum of 6 characters — no strength requirements.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="reset-password-input">
                New password
              </label>
              <Input
                id="reset-password-input"
                type="password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="Minimum 6 characters"
                data-testid="input-reset-password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="reset-password-confirm">
                Confirm new password
              </label>
              <Input
                id="reset-password-confirm"
                type="password"
                value={resetPasswordConfirm}
                onChange={(e) => setResetPasswordConfirm(e.target.value)}
                placeholder="Re-enter the password"
                data-testid="input-reset-password-confirm"
              />
            </div>
            {resetPasswordValue.length > 0 && resetPasswordValue.length < 6 && (
              <p className="text-sm text-destructive">Password must be at least 6 characters.</p>
            )}
            {resetPasswordValue.length >= 6 && resetPasswordConfirm && resetPasswordValue !== resetPasswordConfirm && (
              <p className="text-sm text-destructive">Passwords do not match.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!resetPasswordTarget) return;
                if (!resetPasswordValue || resetPasswordValue.length < 6 || resetPasswordValue !== resetPasswordConfirm) return;
                resetPasswordMutation.mutate({ userId: resetPasswordTarget.id, password: resetPasswordValue });
              }}
              disabled={
                !resetPasswordTarget ||
                resetPasswordValue.length < 6 ||
                resetPasswordValue !== resetPasswordConfirm ||
                resetPasswordMutation.isPending
              }
              data-testid="button-confirm-reset-password"
            >
              {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JitsiCallDialog
        isOpen={jitsiCall.inCall || !!jitsiCall.incomingCall}
        roomUrl={jitsiCall.getJitsiUrl()}
        roomName={jitsiCall.currentRoom?.roomName || null}
        jitsiConfig={jitsiCall.jitsiConfig}
        callType={jitsiCall.currentRoom?.callType || jitsiCall.incomingCall?.callType || "video"}
        participants={
          activeCallTarget
            ? [{ id: activeCallTarget.id, name: activeCallTarget.name }]
            : []
        }
        isHost={jitsiCall.currentRoom?.createdBy === user?.id}
        incomingCall={
          jitsiCall.incomingCall
            ? {
                callerName: jitsiCall.incomingCall.callerName,
                callType: jitsiCall.incomingCall.callType,
              }
            : null
        }
        onAccept={() => jitsiCall.acceptIncomingCall()}
        onReject={() => {
          setActiveCallTarget(null);
          jitsiCall.rejectIncomingCall();
        }}
        onLeave={() => {
          setActiveCallTarget(null);
          jitsiCall.leaveCall();
        }}
        onEnd={() => {
          setActiveCallTarget(null);
          jitsiCall.endCall();
        }}
        isJoining={jitsiCall.isJoining}
      />
    </DashboardLayout>
  );
}
