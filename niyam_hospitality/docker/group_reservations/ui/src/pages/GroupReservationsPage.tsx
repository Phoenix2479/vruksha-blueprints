import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Users, Calendar, Building, DollarSign, Plus, Search, FileText, UserPlus, CheckCircle } from "lucide-react";
import { getGroups, getRoomBlocks, getRoomingList, createGroup, pickupRoom, type Group, type RoomBlock, type RoomingListEntry } from "../api";

export default function GroupReservationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups", statusFilter],
    queryFn: () => getGroups(statusFilter || undefined),
  });

  const filteredGroups = groups.filter(g =>
    g.group_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.organizer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    totalGroups: groups.length,
    activeGroups: groups.filter(g => g.status === 'confirmed').length,
    totalRooms: groups.reduce((sum, g) => sum + g.total_rooms, 0),
    pickedUp: groups.reduce((sum, g) => sum + g.picked_up_rooms, 0),
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Group Reservations</h1>
            <p className="text-gray-500">Manage group bookings and rooming lists</p>
          </div>
          <Button onClick={() => setShowAddGroup(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Group
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Total Groups" value={stats.totalGroups} icon={Users} />
          <StatsCard title="Active Groups" value={stats.activeGroups} icon={CheckCircle} />
          <StatsCard title="Total Rooms Blocked" value={stats.totalRooms} icon={Building} />
          <StatsCard title="Picked Up" value={`${stats.pickedUp}/${stats.totalRooms}`} icon={UserPlus} />
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            className="border rounded-md px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="tentative">Tentative</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Groups</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Rooms</TableHead>
                    <TableHead>Pickup</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow
                      key={group.id}
                      className={`cursor-pointer ${selectedGroup?.id === group.id ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedGroup(group)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{group.group_name}</div>
                          {group.organizer_name && (
                            <div className="text-sm text-gray-500">{group.organizer_name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(group.arrival_date).toLocaleDateString()} - {new Date(group.departure_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{group.total_rooms}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500"
                              style={{ width: `${(group.picked_up_rooms / group.total_rooms) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm">{group.picked_up_rooms}/{group.total_rooms}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={group.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          <div>
            {selectedGroup ? (
              <GroupDetail group={selectedGroup} />
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  Select a group to view details
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <AddGroupDialog open={showAddGroup} onClose={() => setShowAddGroup(false)} />
      </div>
    </div>
  );
}

function GroupDetail({ group }: { group: Group }) {
  const queryClient = useQueryClient();
  const { data: blocks = [] } = useQuery<RoomBlock[]>({
    queryKey: ["room-blocks", group.id],
    queryFn: () => getRoomBlocks(group.id),
  });
  const { data: roomingList = [] } = useQuery<RoomingListEntry[]>({
    queryKey: ["rooming-list", group.id],
    queryFn: () => getRoomingList(group.id),
  });

  const pickup = useMutation({
    mutationFn: (entryId: string) => pickupRoom(group.id, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooming-list", group.id] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{group.group_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Organizer</span>
            <span>{group.organizer_name || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Dates</span>
            <span>{new Date(group.arrival_date).toLocaleDateString()} - {new Date(group.departure_date).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Group Rate</span>
            <span>{group.group_rate ? `$${group.group_rate}` : '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Cutoff Date</span>
            <span>{group.cutoff_date ? new Date(group.cutoff_date).toLocaleDateString() : '-'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room Blocks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {blocks.map((block) => (
              <div key={block.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                  <div className="font-medium text-sm">{block.room_type}</div>
                  <div className="text-xs text-gray-500">${block.rate}/night</div>
                </div>
                <div className="text-sm">
                  {block.picked_up_count}/{block.blocked_count}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rooming List ({roomingList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {roomingList.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <div className="font-medium text-sm">{entry.guest_name}</div>
                  <div className="text-xs text-gray-500">{entry.room_type}</div>
                </div>
                {entry.status === 'pending' ? (
                  <Button size="sm" onClick={() => pickup.mutate(entry.id)}>
                    Pick Up
                  </Button>
                ) : (
                  <StatusBadge status={entry.status} />
                )}
              </div>
            ))}
            {roomingList.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No guests in rooming list</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AddGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    group_name: "",
    organizer_name: "",
    organizer_email: "",
    organizer_phone: "",
    arrival_date: "",
    departure_date: "",
    total_rooms: 10,
    group_rate: "",
    cutoff_date: "",
  });

  const create = useMutation({
    mutationFn: () => createGroup(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Group Reservation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Group Name *</Label>
            <Input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Arrival Date *</Label>
              <Input type="date" value={form.arrival_date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} />
            </div>
            <div>
              <Label>Departure Date *</Label>
              <Input type="date" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Total Rooms</Label>
              <Input type="number" value={form.total_rooms} onChange={(e) => setForm({ ...form, total_rooms: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Group Rate</Label>
              <Input type="number" value={form.group_rate} onChange={(e) => setForm({ ...form, group_rate: e.target.value })} placeholder="$/night" />
            </div>
          </div>
          <div>
            <Label>Organizer Name</Label>
            <Input value={form.organizer_name} onChange={(e) => setForm({ ...form, organizer_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.organizer_email} onChange={(e) => setForm({ ...form, organizer_email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.organizer_phone} onChange={(e) => setForm({ ...form, organizer_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Cutoff Date</Label>
            <Input type="date" value={form.cutoff_date} onChange={(e) => setForm({ ...form, cutoff_date: e.target.value })} />
          </div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Create Group" loading={create.isPending} disabled={!form.group_name || !form.arrival_date || !form.departure_date} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
