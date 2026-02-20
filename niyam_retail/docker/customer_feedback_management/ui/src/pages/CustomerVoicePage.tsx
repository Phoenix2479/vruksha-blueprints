import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi, type Feedback, type FeedbackStats, type SentimentTrend } from '../api/feedbackApi';
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  ScrollArea, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Skeleton,
} from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import {
  MessageCircle, ThumbsUp, ThumbsDown, Minus, Star, TrendingUp, Clock,
  Search, Eye, Trash2, Smile, Meh, Frown,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CustomerVoicePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSentiment, setFilterSentiment] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stats } = useQuery<FeedbackStats>({ queryKey: ['feedback-stats'], queryFn: feedbackApi.getStats });
  const { data: feedback = [], isLoading } = useQuery({ queryKey: ['feedback', filterStatus, filterSentiment], queryFn: () => feedbackApi.list({
    status: filterStatus !== 'all' ? filterStatus as Feedback['status'] : undefined,
    sentiment: filterSentiment !== 'all' ? filterSentiment as Feedback['sentiment'] : undefined,
  })});
  const { data: trends = [] } = useQuery<SentimentTrend[]>({ queryKey: ['sentiment-trends'], queryFn: () => feedbackApi.getSentimentTrends(30) });

  const respondMutation = useMutation({
    mutationFn: ({ id, response }: { id: number; response: string }) => feedbackApi.respond(id, response),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feedback'] }); setSelectedFeedback(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: feedbackApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
  });

  const filtered = feedback.filter(f =>
    f.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-7 w-7 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold">Customer Voice</h1>
              <p className="text-sm text-muted-foreground">Feedback, reviews & sentiment analysis</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="feedback">All Feedback</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="complaints">Complaints</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard title="Total Feedback" value={`${stats?.totalFeedback || 0}`} icon={MessageCircle} iconColor="text-indigo-600" iconBgColor="bg-indigo-100" subtitle={`${stats?.newFeedback || 0} new`} />
                <StatsCard title="Avg Rating" value={`${(stats?.avgRating || 0).toFixed(1)}`} icon={Star} iconColor="text-amber-600" iconBgColor="bg-amber-100" subtitle="out of 5" />
                <StatsCard title="NPS Score" value={`${(stats?.nps || 0).toFixed(0)}`} icon={TrendingUp} iconColor="text-green-600" iconBgColor="bg-green-100" />
                <StatsCard title="Response Rate" value={`${((stats?.responseRate || 0) * 100).toFixed(0)}%`} icon={Clock} iconColor="text-blue-600" iconBgColor="bg-blue-100" subtitle={`${(stats?.avgResponseTime || 0).toFixed(1)}h avg`} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4 flex items-center gap-4">
                    <Smile className="h-10 w-10 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700">{((stats?.positivePercent || 0) * 100).toFixed(0)}%</p>
                      <p className="text-sm text-green-600">Positive</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-50 border-gray-200">
                  <CardContent className="pt-4 flex items-center gap-4">
                    <Meh className="h-10 w-10 text-gray-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-700">{(100 - (stats?.positivePercent || 0) * 100 - (stats?.negativePercent || 0) * 100).toFixed(0)}%</p>
                      <p className="text-sm text-gray-600">Neutral</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4 flex items-center gap-4">
                    <Frown className="h-10 w-10 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700">{((stats?.negativePercent || 0) * 100).toFixed(0)}%</p>
                      <p className="text-sm text-red-600">Negative</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {trends.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Sentiment Trend (30 Days)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trends}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Area type="monotone" dataKey="positive" stackId="1" stroke="#22c55e" fill="#bbf7d0" />
                          <Area type="monotone" dataKey="neutral" stackId="1" stroke="#6b7280" fill="#e5e7eb" />
                          <Area type="monotone" dataKey="negative" stackId="1" stroke="#ef4444" fill="#fecaca" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="feedback" className="mt-6">
            <FeedbackList feedback={filtered} isLoading={isLoading} searchTerm={searchTerm} onSearchChange={setSearchTerm}
              filterStatus={filterStatus} onFilterStatusChange={setFilterStatus} filterSentiment={filterSentiment} onFilterSentimentChange={setFilterSentiment}
              onView={setSelectedFeedback} onDelete={id => { if (confirm('Delete?')) deleteMutation.mutate(id); }} />
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            <FeedbackList feedback={filtered.filter(f => f.type === 'review')} isLoading={isLoading} searchTerm={searchTerm} onSearchChange={setSearchTerm}
              filterStatus={filterStatus} onFilterStatusChange={setFilterStatus} filterSentiment={filterSentiment} onFilterSentimentChange={setFilterSentiment}
              onView={setSelectedFeedback} onDelete={id => { if (confirm('Delete?')) deleteMutation.mutate(id); }} />
          </TabsContent>

          <TabsContent value="complaints" className="mt-6">
            <FeedbackList feedback={filtered.filter(f => f.type === 'complaint')} isLoading={isLoading} searchTerm={searchTerm} onSearchChange={setSearchTerm}
              filterStatus={filterStatus} onFilterStatusChange={setFilterStatus} filterSentiment={filterSentiment} onFilterSentimentChange={setFilterSentiment}
              onView={setSelectedFeedback} onDelete={id => { if (confirm('Delete?')) deleteMutation.mutate(id); }} />
          </TabsContent>
        </Tabs>
      </main>

      {selectedFeedback && (
        <FeedbackDialog feedback={selectedFeedback} onClose={() => setSelectedFeedback(null)}
          onRespond={response => respondMutation.mutate({ id: selectedFeedback.id, response })} isLoading={respondMutation.isPending} />
      )}
    </div>
  );
}

function FeedbackList({ feedback, isLoading, searchTerm, onSearchChange, filterStatus, onFilterStatusChange, filterSentiment, onFilterSentimentChange, onView, onDelete }: {
  feedback: Feedback[]; isLoading: boolean; searchTerm: string; onSearchChange: (v: string) => void;
  filterStatus: string; onFilterStatusChange: (v: string) => void; filterSentiment: string; onFilterSentimentChange: (v: string) => void;
  onView: (f: Feedback) => void; onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={searchTerm} onChange={e => onSearchChange(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterStatus} onValueChange={onFilterStatusChange}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSentiment} onValueChange={onFilterSentimentChange}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Sentiment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiment</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Sentiment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-12 w-full" /></TableCell></TableRow>)
              ) : feedback.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No feedback found</TableCell></TableRow>
              ) : (
                feedback.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.customerName}</TableCell>
                    <TableCell><Badge variant="outline">{f.type}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{f.content}</TableCell>
                    <TableCell>{f.rating ? <div className="flex items-center gap-1"><Star className="h-4 w-4 text-amber-500 fill-amber-500" />{f.rating}</div> : '-'}</TableCell>
                    <TableCell><SentimentBadge sentiment={f.sentiment} /></TableCell>
                    <TableCell><StatusBadge status={f.status === 'resolved' ? 'active' : f.status === 'new' ? 'warning' : 'inactive'} label={f.status.replace('_', ' ')} size="sm" /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onView(f)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(f.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: Feedback['sentiment'] }) {
  const config = {
    positive: { icon: ThumbsUp, class: 'bg-green-100 text-green-800' },
    neutral: { icon: Minus, class: 'bg-gray-100 text-gray-800' },
    negative: { icon: ThumbsDown, class: 'bg-red-100 text-red-800' },
  };
  const { icon: Icon, class: cls } = config[sentiment];
  return <Badge className={cls}><Icon className="h-3 w-3 mr-1" />{sentiment}</Badge>;
}

function FeedbackDialog({ feedback, onClose, onRespond, isLoading }: {
  feedback: Feedback; onClose: () => void; onRespond: (response: string) => void; isLoading: boolean;
}) {
  const [response, setResponse] = useState(feedback.response || '');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Feedback from {feedback.customerName}</DialogTitle>
          <DialogDescription>{feedback.type} via {feedback.channel} • {new Date(feedback.createdAt).toLocaleDateString()}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4">
            <SentimentBadge sentiment={feedback.sentiment} />
            {feedback.rating && <div className="flex items-center gap-1"><Star className="h-4 w-4 text-amber-500 fill-amber-500" />{feedback.rating}/5</div>}
          </div>
          {feedback.title && <p className="font-medium">{feedback.title}</p>}
          <p className="text-sm bg-muted p-3 rounded">{feedback.content}</p>
          {feedback.productName && <p className="text-sm text-muted-foreground">Product: {feedback.productName}</p>}
          <div className="space-y-2">
            <Label>Response</Label>
            <textarea className="w-full min-h-[100px] p-3 border rounded-md resize-none" value={response} onChange={e => setResponse(e.target.value)} placeholder="Write your response..." />
          </div>
        </div>
        <DialogButtons onCancel={onClose} onConfirm={() => onRespond(response)} confirmText={isLoading ? 'Sending...' : 'Send Response'} confirmLoading={isLoading} confirmDisabled={!response.trim()} />
      </DialogContent>
    </Dialog>
  );
}
