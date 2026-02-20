import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { onboardingApi, type OnboardingTask, type OnboardingProgress } from '../api/onboardingApi';
import { Card, CardContent, CardHeader, CardTitle, Button, Progress, Skeleton, Badge } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Rocket, CheckCircle, Circle, SkipForward, Clock, ExternalLink, ArrowRight } from 'lucide-react';

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: progress, isLoading: progressLoading } = useQuery<OnboardingProgress>({ queryKey: ['onboarding-progress'], queryFn: onboardingApi.getProgress });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({ queryKey: ['onboarding-tasks'], queryFn: onboardingApi.getTasks });

  const completeMutation = useMutation({ mutationFn: onboardingApi.completeTask, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] }); queryClient.invalidateQueries({ queryKey: ['onboarding-progress'] }); } });
  const skipMutation = useMutation({ mutationFn: onboardingApi.skipTask, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] }); queryClient.invalidateQueries({ queryKey: ['onboarding-progress'] }); } });

  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Rocket className="h-7 w-7 text-violet-600" />
            <div><h1 className="text-xl font-bold">Getting Started</h1><p className="text-sm text-muted-foreground">Setup your retail system</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {progressLoading ? <Card><CardContent className="pt-4"><Skeleton className="h-24 w-full" /></CardContent></Card> : (
          <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div><p className="text-sm text-muted-foreground">Setup Progress</p><p className="text-3xl font-bold">{progress?.completed || 0} / {progress?.totalTasks || 0} tasks</p></div>
                <div className="text-right"><p className="text-4xl font-bold text-violet-600">{(progress?.percentComplete || 0).toFixed(0)}%</p><p className="text-sm text-muted-foreground">complete</p></div>
              </div>
              <Progress value={progress?.percentComplete || 0} className="h-3" />
              {progress?.nextTask && (
                <div className="mt-4 p-3 bg-white rounded-lg border flex items-center justify-between">
                  <div><p className="text-sm text-muted-foreground">Up next</p><p className="font-medium">{progress.nextTask.title}</p></div>
                  <Button size="sm" onClick={() => completeMutation.mutate(progress.nextTask!.id)}>Start <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Tasks ({tasks.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6"><TaskList tasks={tasks} isLoading={tasksLoading} onComplete={id => completeMutation.mutate(id)} onSkip={id => skipMutation.mutate(id)} /></TabsContent>
          <TabsContent value="pending" className="mt-6"><TaskList tasks={pending} isLoading={tasksLoading} onComplete={id => completeMutation.mutate(id)} onSkip={id => skipMutation.mutate(id)} /></TabsContent>
          <TabsContent value="completed" className="mt-6"><TaskList tasks={completed} isLoading={tasksLoading} onComplete={id => completeMutation.mutate(id)} onSkip={id => skipMutation.mutate(id)} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function TaskList({ tasks, isLoading, onComplete, onSkip }: { tasks: OnboardingTask[]; isLoading: boolean; onComplete: (id: string) => void; onSkip: (id: string) => void }) {
  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div>;
  if (tasks.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground">No tasks</CardContent></Card>;

  return (
    <div className="space-y-3">
      {tasks.map(t => (
        <Card key={t.id} className={t.status === 'completed' ? 'bg-green-50/50 border-green-200' : ''}>
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="mt-1">{t.status === 'completed' ? <CheckCircle className="h-5 w-5 text-green-600" /> : t.status === 'skipped' ? <SkipForward className="h-5 w-5 text-gray-400" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div><h3 className={`font-medium ${t.status === 'completed' ? 'text-green-800' : ''}`}>{t.title}</h3><p className="text-sm text-muted-foreground mt-1">{t.description}</p></div>
                  <Badge variant="outline">{t.category}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> ~{t.estimatedMinutes} min</div>
                  {t.status !== 'completed' && t.status !== 'skipped' && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onSkip(t.id)}>Skip</Button>
                      <Button size="sm" onClick={() => onComplete(t.id)}>Complete</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
