import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { Sparkles, Clock, CheckCircle, AlertTriangle, Loader2, RefreshCw, Bed, Wrench } from "lucide-react";
import { getTasks, getRooms, getStats, updateTaskStatus, updateRoomStatus, type HousekeepingTask, type Room } from "../api";

export default function HousekeepingPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed">("pending");
  const [viewMode, setViewMode] = useState<"tasks" | "rooms">("tasks");

  // Queries
  const { data: tasks = [], isLoading: tasksLoading, refetch } = useQuery({
    queryKey: ["housekeeping-tasks"],
    queryFn: () => getTasks(),
    refetchInterval: 30000,
  });

  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ["housekeeping-rooms"],
    queryFn: getRooms,
    refetchInterval: 30000,
    enabled: viewMode === "rooms",
  });

  const { data: stats } = useQuery({
    queryKey: ["housekeeping-stats"],
    queryFn: getStats,
    refetchInterval: 60000,
  });

  // Mutations
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      updateTaskStatus(taskId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-stats"] });
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({ roomId, status }: { roomId: string; status: string }) =>
      updateRoomStatus(roomId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-rooms"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-stats"] });
    },
  });

  // Filter tasks
  const filteredTasks = filter === "all"
    ? tasks
    : tasks.filter(t => t.status === filter);

  // Group rooms by status
  const dirtyRooms = rooms.filter(r => r.status === "dirty");
  const maintenanceRooms = rooms.filter(r => r.status === "maintenance");
  const availableRooms = rooms.filter(r => r.status === "available");

  const getStatusColor = (status: string): "warning" | "info" | "active" | "neutral" | "error" => {
    const colors: Record<string, "warning" | "info" | "active" | "neutral" | "error"> = {
      pending: "warning",
      in_progress: "info",
      completed: "active",
      verified: "active",
      dirty: "error",
      maintenance: "warning",
      available: "active",
      occupied: "info",
    };
    return colors[status] || "neutral";
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "text-gray-500",
      medium: "text-yellow-600",
      high: "text-orange-600",
      urgent: "text-red-600",
    };
    return colors[priority] || "text-gray-500";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-cyan-600" />
            <div>
              <h1 className="text-xl font-bold">Housekeeping</h1>
              <p className="text-sm text-muted-foreground">Room & Task Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "tasks" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("tasks")}
            >
              Tasks
            </Button>
            <Button
              variant={viewMode === "rooms" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("rooms")}
            >
              Rooms
            </Button>
            <div className="border-l mx-2 h-6" />
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="Pending Tasks"
            value={stats?.pending_tasks ?? tasks.filter(t => t.status === "pending").length}
            icon={Clock}
            iconColor="text-yellow-600"
            iconBg="bg-yellow-100"
          />
          <StatsCard
            title="In Progress"
            value={stats?.in_progress ?? tasks.filter(t => t.status === "in_progress").length}
            icon={Sparkles}
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
          />
          <StatsCard
            title="Rooms to Clean"
            value={stats?.rooms_to_clean ?? dirtyRooms.length}
            icon={Bed}
            iconColor="text-red-600"
            iconBg="bg-red-100"
          />
          <StatsCard
            title="Available Rooms"
            value={stats?.rooms_available ?? availableRooms.length}
            icon={CheckCircle}
            iconColor="text-green-600"
            iconBg="bg-green-100"
          />
        </div>

        {/* Tasks View */}
        {viewMode === "tasks" && (
          <>
            <div className="flex items-center gap-2">
              {(["all", "pending", "in_progress", "completed"] as const).map(f => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f.replace("_", " ")}
                </Button>
              ))}
            </div>

            {tasksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No tasks found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTasks.map(task => (
                  <Card
                    key={task.id}
                    className={task.priority === "urgent" ? "border-red-500 border-2" : ""}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {task.task_type === "cleaning" ? (
                            <Sparkles className="h-5 w-5 text-cyan-600" />
                          ) : task.task_type === "repair" ? (
                            <Wrench className="h-5 w-5 text-orange-600" />
                          ) : (
                            <Bed className="h-5 w-5 text-purple-600" />
                          )}
                          <span className="font-medium">Room {task.room_number || "N/A"}</span>
                        </div>
                        <StatusBadge
                          status={getStatusColor(task.status)}
                          label={task.status.replace("_", " ")}
                          size="sm"
                        />
                      </div>
                      <p className={`text-sm font-medium ${getPriorityColor(task.priority)}`}>
                        {task.priority.toUpperCase()} Priority
                      </p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2 capitalize">
                        {task.task_type.replace("_", " ")}
                      </p>
                      {task.notes && (
                        <p className="text-sm text-muted-foreground italic mb-3">{task.notes}</p>
                      )}
                      {task.assigned_to && (
                        <p className="text-xs text-muted-foreground mb-3">
                          Assigned to: {task.assigned_to}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {task.status === "pending" && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: "in_progress" })}
                            disabled={updateTaskMutation.isPending}
                          >
                            Start
                          </Button>
                        )}
                        {task.status === "in_progress" && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: "completed" })}
                            disabled={updateTaskMutation.isPending}
                          >
                            Complete
                          </Button>
                        )}
                        {task.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: "verified" })}
                            disabled={updateTaskMutation.isPending}
                          >
                            Verify
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Rooms View */}
        {viewMode === "rooms" && (
          <>
            {roomsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Dirty Rooms */}
                {dirtyRooms.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-red-600">
                        Rooms to Clean ({dirtyRooms.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {dirtyRooms.map(room => (
                          <Card key={room.id} className="p-3 border-red-200 bg-red-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold">{room.room_number}</span>
                              <span className="text-xs text-muted-foreground">{room.room_type}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => updateRoomMutation.mutate({ roomId: room.id, status: "available" })}
                              disabled={updateRoomMutation.isPending}
                            >
                              Mark Clean
                            </Button>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Maintenance Rooms */}
                {maintenanceRooms.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-orange-600">
                        Under Maintenance ({maintenanceRooms.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {maintenanceRooms.map(room => (
                          <Card key={room.id} className="p-3 border-orange-200 bg-orange-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold">{room.room_number}</span>
                              <Wrench className="h-4 w-4 text-orange-600" />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => updateRoomMutation.mutate({ roomId: room.id, status: "dirty" })}
                              disabled={updateRoomMutation.isPending}
                            >
                              Fixed
                            </Button>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* All Rooms Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">All Rooms ({rooms.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
                      {rooms.map(room => (
                        <div
                          key={room.id}
                          className={`p-2 rounded border text-center ${
                            room.status === "available" ? "bg-green-50 border-green-200" :
                            room.status === "occupied" ? "bg-blue-50 border-blue-200" :
                            room.status === "dirty" ? "bg-red-50 border-red-200" :
                            room.status === "maintenance" ? "bg-orange-50 border-orange-200" :
                            "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <span className="font-medium text-sm">{room.room_number}</span>
                          <p className="text-xs text-muted-foreground capitalize">{room.status}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
