import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label, Tabs, TabsList, TabsTrigger } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Building, UserCheck, UserMinus, Clock, Search, DollarSign, CreditCard, Bell, RefreshCw, Loader2, Calendar, ChevronLeft, ChevronRight, Bed, Plus } from "lucide-react";
import { getArrivals, getDepartures, getInhouseGuests, getStats, checkInGuest, checkOutGuest, getReservationsForTimeline, type GuestArrival, type GuestDeparture, type TimelineReservation } from "../api";
import { bookingColors, spacing } from "@shared/styles/spacing";

// Timeline/Gantt View Component
function RoomTimeline({ 
  startDate, 
  days,
  reservations,
  onAddBooking 
}: { 
  startDate: Date; 
  days: number;
  reservations: TimelineReservation[];
  onAddBooking?: (roomId: string, date: Date) => void;
}) {
  // Generate dates array
  const dates = useMemo(() => {
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      result.push(date);
    }
    return result;
  }, [startDate, days]);

  // Group reservations by room
  const roomsWithBookings = useMemo(() => {
    const roomMap = new Map<string, { room_number: string; room_type: string; floor: number; bookings: TimelineReservation[] }>();
    
    reservations.forEach((res, idx) => {
      if (!roomMap.has(res.room_id)) {
        roomMap.set(res.room_id, {
          room_number: res.room_number,
          room_type: res.room_type,
          floor: res.floor || 1,
          bookings: []
        });
      }
      roomMap.get(res.room_id)!.bookings.push({ ...res, colorIdx: idx % bookingColors.length });
    });
    
    return Array.from(roomMap.values()).sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));
  }, [reservations]);

  // Calculate booking bar position
  const getBookingStyle = (booking: TimelineReservation & { colorIdx?: number }) => {
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const timelineStart = startDate.getTime();
    const dayWidth = 100 / days;
    
    const startOffset = Math.max(0, (checkIn.getTime() - timelineStart) / (1000 * 60 * 60 * 24));
    const endOffset = Math.min(days, (checkOut.getTime() - timelineStart) / (1000 * 60 * 60 * 24));
    const width = endOffset - startOffset;
    
    return {
      left: `${startOffset * dayWidth}%`,
      width: `${width * dayWidth}%`,
    };
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[1200px]">
        {/* Header with dates */}
        <div className="flex border-b sticky top-0 bg-card z-10">
          <div className={`${spacing.timeline.roomColumn} flex-shrink-0 ${spacing.timeline.cell} font-medium text-sm border-r bg-muted/50`}>
            Room
          </div>
          <div className="flex-1 flex">
            {dates.map((date, idx) => {
              const isToday = date.toDateString() === today.toDateString();
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <div
                  key={idx}
                  className={`flex-1 ${spacing.timeline.cellCompact} text-center text-xs border-r transition-colors ${
                    isToday ? "bg-blue-100 font-bold" : isWeekend ? "bg-slate-50" : "hover:bg-muted/20"
                  }`}
                >
                  <div className="text-muted-foreground">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className={isToday ? "text-blue-600 font-semibold" : ""}>
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Room rows */}
        {roomsWithBookings.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Bed className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No rooms or reservations</p>
            <p className="text-sm">Reservations will appear here when available</p>
          </div>
        ) : (
          roomsWithBookings.map((room) => (
            <div key={room.room_number} className="flex border-b hover:bg-muted/20 transition-colors">
              <div className={`${spacing.timeline.roomColumn} flex-shrink-0 ${spacing.timeline.cell} border-r bg-muted/10`}>
                <div className="font-medium text-sm">{room.room_number}</div>
                <div className="text-xs text-muted-foreground truncate">{room.room_type}</div>
              </div>
              <div className={`flex-1 relative ${spacing.timeline.row}`}>
                {/* Grid lines */}
                <div className="absolute inset-0 flex">
                  {dates.map((date, idx) => {
                    const isToday = date.toDateString() === today.toDateString();
                    return (
                      <div 
                        key={idx} 
                        className={`flex-1 border-r ${isToday ? "bg-blue-50/50" : ""}`}
                        onClick={() => onAddBooking?.(room.room_number, date)}
                      />
                    );
                  })}
                </div>
                
                {/* Booking bars */}
                {room.bookings.map((booking) => {
                  const style = getBookingStyle(booking);
                  const colors = bookingColors[booking.colorIdx || 0];
                  return (
                    <div
                      key={booking.booking_id}
                      className={`absolute top-2 h-12 rounded-md border-2 ${colors.bg} ${colors.border} cursor-pointer hover:shadow-md transition-shadow flex items-center px-2 overflow-hidden`}
                      style={style}
                      title={`${booking.guest_name}\n${booking.check_in} - ${booking.check_out}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-gray-600">
                            {booking.guest_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-medium truncate ${colors.text}`}>
                            {booking.guest_name}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {booking.status === "checked_in" ? "In-house" : booking.status}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function FrontOfficePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"timeline" | "arrivals" | "departures" | "inhouse">("timeline");
  const [timelineStartDate, setTimelineStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [timelineDays, setTimelineDays] = useState(14);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestArrival | null>(null);
  const [selectedDeparture, setSelectedDeparture] = useState<GuestDeparture | null>(null);
  const [idProofType, setIdProofType] = useState("");
  const [idProofNumber, setIdProofNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [searchQuery, setSearchQuery] = useState("");

  // Queries
  const { data: arrivals = [], isLoading: arrivalsLoading, refetch: refetchArrivals } = useQuery({
    queryKey: ["arrivals"],
    queryFn: getArrivals,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: departures = [], isLoading: departuresLoading, refetch: refetchDepartures } = useQuery({
    queryKey: ["departures"],
    queryFn: getDepartures,
    refetchInterval: 30000,
  });

  const { data: inhouseGuests = [], isLoading: inhouseLoading } = useQuery({
    queryKey: ["inhouse"],
    queryFn: getInhouseGuests,
    enabled: activeTab === "inhouse",
  });

  const { data: stats } = useQuery({
    queryKey: ["front-office-stats"],
    queryFn: getStats,
    refetchInterval: 60000,
  });

  // Timeline query
  const timelineEndDate = useMemo(() => {
    const end = new Date(timelineStartDate);
    end.setDate(end.getDate() + timelineDays);
    return end;
  }, [timelineStartDate, timelineDays]);

  const { data: timelineReservations = [], isLoading: timelineLoading } = useQuery({
    queryKey: ["timeline-reservations", timelineStartDate.toISOString(), timelineEndDate.toISOString()],
    queryFn: () => getReservationsForTimeline(timelineStartDate.toISOString().split("T")[0], timelineEndDate.toISOString().split("T")[0]),
    enabled: activeTab === "timeline",
  });

  // Navigate timeline
  const navigateTimeline = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setTimelineStartDate(today);
    } else {
      const newDate = new Date(timelineStartDate);
      newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
      setTimelineStartDate(newDate);
    }
  };

  // Mutations
  const checkInMutation = useMutation({
    mutationFn: ({ bookingId, idType, idNumber }: { bookingId: string; idType: string; idNumber: string }) =>
      checkInGuest(bookingId, idType, idNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["front-office-stats"] });
      setShowCheckinModal(false);
      setSelectedGuest(null);
      setIdProofType("");
      setIdProofNumber("");
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: ({ bookingId, method }: { bookingId: string; method: string }) =>
      checkOutGuest(bookingId, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departures"] });
      queryClient.invalidateQueries({ queryKey: ["front-office-stats"] });
      setShowCheckoutModal(false);
      setSelectedDeparture(null);
    },
  });

  // Filter arrivals by search
  const filteredArrivals = arrivals.filter(a =>
    a.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.room_number.includes(searchQuery) ||
    a.reservation_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCheckin = (guest: GuestArrival) => {
    setSelectedGuest(guest);
    setShowCheckinModal(true);
  };

  const handleCheckout = (guest: GuestDeparture) => {
    setSelectedDeparture(guest);
    setShowCheckoutModal(true);
  };

  const confirmCheckin = () => {
    if (selectedGuest) {
      checkInMutation.mutate({
        bookingId: selectedGuest.id,
        idType: idProofType,
        idNumber: idProofNumber,
      });
    }
  };

  const confirmCheckout = () => {
    if (selectedDeparture) {
      checkOutMutation.mutate({
        bookingId: selectedDeparture.id,
        method: paymentMethod,
      });
    }
  };

  const expectedArrivals = arrivals.filter(a => a.status === "expected").length;
  const checkedInToday = arrivals.filter(a => a.status === "checked_in").length;

  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Front Office</h1>
              <p className="text-sm text-muted-foreground">Guest Check-in & Check-out</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="hidden md:block">
              <TabsList>
                <TabsTrigger value="timeline" className="gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Room View
                </TabsTrigger>
                <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
                <TabsTrigger value="departures">Departures</TabsTrigger>
                <TabsTrigger value="inhouse">In-House</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="icon" onClick={() => { refetchArrivals(); refetchDepartures(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
        <div className={`grid grid-cols-1 md:grid-cols-4 ${spacing.cardGap}`}>
          <StatsCard title="Expected Arrivals" value={stats?.expected_arrivals ?? expectedArrivals} icon={UserCheck} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <StatsCard title="Checked In Today" value={checkedInToday} icon={Clock} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="Departures Today" value={stats?.departures_today ?? departures.length} icon={UserMinus} iconColor="text-orange-600" iconBg="bg-orange-100" />
          <StatsCard title="In-House Guests" value={stats?.inhouse_guests ?? 0} icon={Building} iconColor="text-purple-600" iconBg="bg-purple-100" subtitle={stats ? `${stats.occupancy_rate}% occupancy` : undefined} />
        </div>

        {activeTab === "timeline" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bed className="h-5 w-5" />
                    Room View
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {timelineStartDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigateTimeline("prev")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateTimeline("today")}>
                    Today
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateTimeline("next")}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="h-6 w-px bg-border mx-2" />
                  <Button 
                    variant={timelineDays === 7 ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setTimelineDays(7)}
                  >
                    7 days
                  </Button>
                  <Button 
                    variant={timelineDays === 14 ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setTimelineDays(14)}
                  >
                    14 days
                  </Button>
                  <Button 
                    variant={timelineDays === 30 ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setTimelineDays(30)}
                  >
                    30 days
                  </Button>
                  <div className="h-6 w-px bg-border mx-2" />
                  <Button variant="default" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Booking
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {timelineLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <RoomTimeline
                  startDate={timelineStartDate}
                  days={timelineDays}
                  reservations={timelineReservations}
                />
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "arrivals" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Today's Arrivals</CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search guests..." 
                    className="pl-10 w-64" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {arrivalsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredArrivals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No matching arrivals found" : "No arrivals scheduled for today"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest</TableHead>
                      <TableHead>Reservation</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Arrival</TableHead>
                      <TableHead>Nights</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArrivals.map(guest => (
                      <TableRow key={guest.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{guest.guest_name}</p>
                            {guest.phone && <p className="text-xs text-muted-foreground">{guest.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{guest.reservation_id}</TableCell>
                        <TableCell>
                          <div>
                            <p>{guest.room_number}</p>
                            {guest.room_type && <p className="text-xs text-muted-foreground">{guest.room_type}</p>}
                          </div>
                        </TableCell>
                        <TableCell>{guest.arrival_time}</TableCell>
                        <TableCell>{guest.nights}</TableCell>
                        <TableCell>
                          <StatusBadge 
                            status={guest.status === "checked_in" ? "active" : "warning"} 
                            label={guest.status.replace("_", " ")} 
                            size="sm" 
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {guest.status === "expected" && (
                            <Button size="sm" onClick={() => handleCheckin(guest)}>Check In</Button>
                          )}
                          {guest.status === "checked_in" && (
                            <Button size="sm" variant="outline">View</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "departures" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Today's Departures</CardTitle></CardHeader>
            <CardContent>
              {departuresLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : departures.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No departures scheduled for today</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Checkout</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departures.map(guest => (
                      <TableRow key={guest.id}>
                        <TableCell className="font-medium">{guest.guest_name}</TableCell>
                        <TableCell>{guest.room_number}</TableCell>
                        <TableCell>{guest.checkout_time}</TableCell>
                        <TableCell className={guest.balance > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                          ${guest.balance.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => handleCheckout(guest)}>Check Out</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "inhouse" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">In-House Guests</CardTitle></CardHeader>
            <CardContent>
              {inhouseLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : inhouseGuests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No guests currently in-house</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inhouseGuests.map(guest => (
                      <TableRow key={guest.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{guest.guest_name}</p>
                            {guest.phone && <p className="text-xs text-muted-foreground">{guest.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{guest.room_number}</p>
                            {guest.room_type && <p className="text-xs text-muted-foreground">{guest.room_type}</p>}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(guest.check_in_date).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(guest.check_out_date).toLocaleDateString()}</TableCell>
                        <TableCell className={(guest.total_amount - guest.paid_amount) > 0 ? "text-red-600" : "text-green-600"}>
                          ${(guest.total_amount - guest.paid_amount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Check-In Modal */}
      <Dialog open={showCheckinModal} onOpenChange={setShowCheckinModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Guest Check-In</DialogTitle></DialogHeader>
          {selectedGuest && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-semibold text-lg">{selectedGuest.guest_name}</p>
                <p className="text-sm text-muted-foreground">
                  Room {selectedGuest.room_number} {selectedGuest.room_type && `(${selectedGuest.room_type})`} | {selectedGuest.nights} nights
                </p>
                {selectedGuest.special_requests && (
                  <p className="text-sm text-amber-600 mt-2">
                    <Bell className="h-4 w-4 inline mr-1" />{selectedGuest.special_requests}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ID Type</Label>
                  <Input 
                    placeholder="Passport / ID" 
                    value={idProofType}
                    onChange={(e) => setIdProofType(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ID Number</Label>
                  <Input 
                    placeholder="Document number" 
                    value={idProofNumber}
                    onChange={(e) => setIdProofNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogButtons 
            onCancel={() => setShowCheckinModal(false)} 
            onConfirm={confirmCheckin} 
            confirmText={checkInMutation.isPending ? "Processing..." : "Complete Check-In"}
            confirmDisabled={checkInMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Check-Out Modal */}
      <Dialog open={showCheckoutModal} onOpenChange={setShowCheckoutModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Guest Check-Out</DialogTitle></DialogHeader>
          {selectedDeparture && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-semibold text-lg">{selectedDeparture.guest_name}</p>
                <p className="text-sm text-muted-foreground">Room {selectedDeparture.room_number}</p>
                <p className={`text-lg font-bold mt-2 ${selectedDeparture.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  Balance: ${selectedDeparture.balance.toFixed(2)}
                </p>
              </div>
              {selectedDeparture.balance > 0 && (
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant={paymentMethod === "card" ? "default" : "outline"} 
                      className="flex-1"
                      onClick={() => setPaymentMethod("card")}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />Card
                    </Button>
                    <Button 
                      variant={paymentMethod === "cash" ? "default" : "outline"} 
                      className="flex-1"
                      onClick={() => setPaymentMethod("cash")}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />Cash
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogButtons 
            onCancel={() => setShowCheckoutModal(false)} 
            onConfirm={confirmCheckout} 
            confirmText={checkOutMutation.isPending ? "Processing..." : "Complete Check-Out"}
            confirmDisabled={checkOutMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
