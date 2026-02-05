/**
 * Admin Live Support Dashboard
 * 
 * Provides real-time monitoring of all active conversations with:
 * - List of all active chats with participants
 * - Online/offline status indicators
 * - Ability to join any conversation
 * - Active calls monitoring
 * - Messaging statistics
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  Users,
  Phone,
  Video,
  Search,
  RefreshCw,
  Eye,
  Send,
  Circle,
  Loader2,
  BarChart3,
  Activity,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PresenceIndicator, AvatarWithPresence } from '@/components/PresenceIndicator';
import { useSocket } from '@/contexts/NotificationContext';
import { useToast } from '@/hooks/use-toast';

interface Participant {
  id: string;
  name: string;
  role: string;
  presence: {
    status: 'online' | 'offline' | 'away';
    lastSeen: string | null;
  };
}

interface Conversation {
  id: string;
  participants: Participant[];
  lastMessage: {
    message: string;
    createdAt: string;
    senderId: string;
  };
  messageCount: number;
  unreadCount: number;
}

interface ConversationDetails {
  messages: Array<{
    id: string;
    senderId: string;
    receiverId: string;
    message: string;
    createdAt: string;
    isRead: boolean;
    status: string;
  }>;
  participants: Participant[];
}

interface Stats {
  totalConversations: number;
  onlineUsers: number;
  activeCalls: number;
}

interface MessagingStats {
  presence: {
    total: number;
    online: number;
    away: number;
    offline: number;
  };
  messageQueue: {
    queueSize: number;
    pending: number;
    retrying: number;
    failed: number;
  };
  calls: {
    totalCalls: number;
    activeCalls: number;
    totalParticipants: number;
    voiceCalls: number;
    videoCalls: number;
  };
}

export default function AdminLiveSupportDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const socket = useSocket();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<{
    user1Id: string;
    user2Id: string;
  } | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [activeTab, setActiveTab] = useState('conversations');

  // Fetch live support data
  const { data: supportData, isLoading, refetch } = useQuery<{
    conversations: Conversation[];
    stats: Stats;
  }>({
    queryKey: ['/api/admin/live-support'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch messaging stats
  const { data: messagingStats } = useQuery<MessagingStats>({
    queryKey: ['/api/admin/messaging-stats'],
    refetchInterval: 15000,
  });

  // Fetch conversation details when selected
  const { data: conversationDetails, isLoading: isLoadingDetails } = useQuery<ConversationDetails>({
    queryKey: ['/api/admin/live-support', selectedConversation?.user1Id, selectedConversation?.user2Id],
    queryFn: async () => {
      if (!selectedConversation) return null;
      const res = await fetch(
        `/api/admin/live-support/${selectedConversation.user1Id}/${selectedConversation.user2Id}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch conversation');
      return res.json();
    },
    enabled: !!selectedConversation,
    refetchInterval: 5000,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ targetUserId, message }: { targetUserId: string; message: string }) => {
      const res = await apiRequest('POST', `/api/admin/live-support/${targetUserId}/message`, {
        message,
      });
      return res.json();
    },
    onSuccess: () => {
      setMessageInput('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/live-support'] });
      toast({
        title: 'Message sent',
        description: 'Your message has been delivered',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to send message',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Filter conversations based on search
  const filteredConversations = supportData?.conversations.filter(conv => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return conv.participants.some(
      p => p.name.toLowerCase().includes(query) || p.role.toLowerCase().includes(query)
    );
  }) || [];

  const handleJoinConversation = (conv: Conversation) => {
    setSelectedConversation({
      user1Id: conv.participants[0].id,
      user2Id: conv.participants[1].id,
    });
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversation) return;
    
    // Send to both participants as admin support
    sendMessageMutation.mutate({
      targetUserId: selectedConversation.user1Id,
      message: messageInput,
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'customer': return 'bg-blue-100 text-blue-700';
      case 'seller': return 'bg-purple-100 text-purple-700';
      case 'rider': return 'bg-orange-100 text-orange-700';
      case 'agent': return 'bg-green-100 text-green-700';
      case 'admin': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <DashboardLayout role={user?.role as 'admin' || 'admin'}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Activity className="h-8 w-8 text-primary" />
              Live Support Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor and join active conversations in real-time
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Conversations</p>
                  <p className="text-2xl font-bold">{supportData?.stats.totalConversations || 0}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Users Online</p>
                  <p className="text-2xl font-bold text-green-600">
                    {messagingStats?.presence.online || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Calls</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {messagingStats?.calls.activeCalls || 0}
                  </p>
                </div>
                <Phone className="h-8 w-8 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Message Queue</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {messagingStats?.messageQueue.pending || 0}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="conversations">
              <MessageSquare className="h-4 w-4 mr-2" />
              Conversations
            </TabsTrigger>
            <TabsTrigger value="calls">
              <Video className="h-4 w-4 mr-2" />
              Active Calls
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 className="h-4 w-4 mr-2" />
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conversations" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Conversation List */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Active Chats</CardTitle>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {isLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : filteredConversations.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No active conversations</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {filteredConversations.map((conv) => (
                            <div
                              key={conv.id}
                              className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                                selectedConversation?.user1Id === conv.participants[0].id &&
                                selectedConversation?.user2Id === conv.participants[1].id
                                  ? 'bg-muted'
                                  : ''
                              }`}
                              onClick={() => handleJoinConversation(conv)}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex -space-x-2">
                                  {conv.participants.slice(0, 2).map((p) => (
                                    <AvatarWithPresence
                                      key={p.id}
                                      userId={p.id}
                                      name={p.name}
                                      size="sm"
                                    />
                                  ))}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {conv.participants.map((p, idx) => (
                                      <span key={p.id} className="text-sm font-medium">
                                        {p.name}{idx < conv.participants.length - 1 ? ' ↔ ' : ''}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex gap-1 mt-1">
                                    {conv.participants.map((p) => (
                                      <Badge
                                        key={p.id}
                                        variant="secondary"
                                        className={`text-xs ${getRoleBadgeColor(p.role)}`}
                                      >
                                        {p.role}
                                      </Badge>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {conv.lastMessage.message}
                                  </p>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs text-muted-foreground">
                                      {formatDistanceToNow(new Date(conv.lastMessage.createdAt), { addSuffix: true })}
                                    </span>
                                    {conv.unreadCount > 0 && (
                                      <Badge variant="default" className="text-xs">
                                        {conv.unreadCount}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Conversation Details */}
              <div className="lg:col-span-2">
                <Card className="h-[600px] flex flex-col">
                  {selectedConversation ? (
                    <>
                      <CardHeader className="pb-3 border-b">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {conversationDetails?.participants.map((p) => (
                              <div key={p.id} className="flex items-center gap-2">
                                <AvatarWithPresence userId={p.id} name={p.name} size="sm" />
                                <div>
                                  <p className="text-sm font-medium">{p.name}</p>
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${getRoleBadgeColor(p.role)}`}
                                  >
                                    {p.role}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                          <Badge variant="outline">
                            {conversationDetails?.messages.length || 0} messages
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full p-4">
                          {isLoadingDetails ? (
                            <div className="flex justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {conversationDetails?.messages.map((msg) => {
                                const sender = conversationDetails.participants.find(
                                  (p) => p.id === msg.senderId
                                );
                                const isAdmin = sender?.role === 'admin' || sender?.role === 'super_admin';
                                
                                return (
                                  <div
                                    key={msg.id}
                                    className={`flex gap-2 ${isAdmin ? 'justify-end' : ''}`}
                                  >
                                    {!isAdmin && (
                                      <AvatarWithPresence
                                        userId={msg.senderId}
                                        name={sender?.name || 'Unknown'}
                                        size="sm"
                                      />
                                    )}
                                    <div
                                      className={`max-w-[70%] rounded-lg px-3 py-2 ${
                                        isAdmin
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-muted'
                                      }`}
                                    >
                                      <p className="text-xs font-medium mb-1 opacity-75">
                                        {sender?.name || 'Unknown'} ({sender?.role})
                                      </p>
                                      <p className="text-sm">{msg.message}</p>
                                      <p className="text-xs opacity-50 mt-1">
                                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </ScrollArea>
                      </CardContent>
                      
                      {/* Admin reply input */}
                      <div className="p-4 border-t">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Send a message as support..."
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                          />
                          <Button
                            onClick={handleSendMessage}
                            disabled={!messageInput.trim() || sendMessageMutation.isPending}
                          >
                            {sendMessageMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Messages will be sent from your admin account
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="font-medium">Select a conversation to view</p>
                        <p className="text-sm">Click on a chat from the left panel</p>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="calls" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Calls</CardTitle>
                <CardDescription>
                  Monitor ongoing voice and video calls
                </CardDescription>
              </CardHeader>
              <CardContent>
                {messagingStats?.calls.activeCalls === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active calls at the moment</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Call cards would be rendered here from API data */}
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
                            <Video className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-medium">Video Call</p>
                            <p className="text-sm text-muted-foreground">
                              {messagingStats?.calls.totalParticipants} participants
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">
                            {messagingStats?.calls.videoCalls} video
                          </Badge>
                          <Badge variant="secondary">
                            {messagingStats?.calls.voiceCalls} voice
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Presence Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Presence
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 fill-green-500 text-green-500" />
                        <span>Online</span>
                      </div>
                      <span className="font-bold text-green-600">
                        {messagingStats?.presence.online || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                        <span>Away</span>
                      </div>
                      <span className="font-bold text-yellow-600">
                        {messagingStats?.presence.away || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 fill-gray-400 text-gray-400" />
                        <span>Offline</span>
                      </div>
                      <span className="font-bold text-gray-600">
                        {messagingStats?.presence.offline || 0}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Total Tracked</span>
                      <span className="font-bold">
                        {messagingStats?.presence.total || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Message Queue Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Message Delivery Queue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Queue Size</span>
                      <span className="font-bold">
                        {messagingStats?.messageQueue.queueSize || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pending</span>
                      <span className="font-bold text-blue-600">
                        {messagingStats?.messageQueue.pending || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Retrying</span>
                      <span className="font-bold text-orange-600">
                        {messagingStats?.messageQueue.retrying || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Failed</span>
                      <span className="font-bold text-red-600">
                        {messagingStats?.messageQueue.failed || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
