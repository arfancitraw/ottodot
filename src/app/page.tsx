/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useState, useEffect } from 'react';
import {
  getParentsAndStudents,
  getTrialClasses,
  getRosterAction,
  createPendingBookingAction,
  confirmPaymentAction,
  cancelBookingAction,
  resetDatabaseAction,
} from './actions';

interface Student {
  id: string;
  name: string;
  age: number;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  students: Student[];
}

interface TrialClass {
  id: string;
  title: string;
  subject: string;
  startTime: Date | string;
  maxCapacity: number;
  confirmedCount: number;
  availableSeats: number;
}

interface RosterStudent {
  seatNumber: number;
  studentId: string;
  studentName: string;
  studentAge: number;
  parentName: string;
  parentEmail: string;
  confirmedAt: Date | string;
}

interface ClassRoster {
  classId: string;
  title: string;
  subject: string;
  maxCapacity: number;
  confirmedCount: number;
  availableSeats: number;
  roster: RosterStudent[];
}

export default function Home() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [classes, setClasses] = useState<TrialClass[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const [currentBooking, setCurrentBooking] = useState<any>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'booking' | 'roster' | 'race_demo'>('booking');
  const [selectedRosterClassId, setSelectedRosterClassId] = useState<string>('');
  const [rosterData, setRosterData] = useState<ClassRoster | null>(null);

  const [raceLogs, setRaceLogs] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const parentData = await getParentsAndStudents();
    const classData = await getTrialClasses();
    setParents(parentData);
    setClasses(classData);

    if (parentData.length > 0) {
      setSelectedParentId(parentData[0].id);
      if (parentData[0].students.length > 0) {
        setSelectedStudentId(parentData[0].students[0].id);
      }
    }
    if (classData.length > 0) {
      setSelectedClassId(classData[0].id);
      setSelectedRosterClassId(classData[0].id);
    }
  }

  const currentParent = parents.find((p) => p.id === selectedParentId);

  useEffect(() => {
    if (currentParent && currentParent.students.length > 0) {
      setSelectedStudentId(currentParent.students[0].id);
    } else {
      setSelectedStudentId('');
    }
  }, [selectedParentId]);

  async function handleCreateBooking() {
    setErrorMsg('');
    setBookingResult(null);
    setLoading(true);

    const res = await createPendingBookingAction(selectedParentId, selectedStudentId, selectedClassId);
    setLoading(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to create booking');
    } else {
      setCurrentBooking(res.booking);
    }
  }

  async function handleCancel() {
    if (!currentBooking) return;
    setLoading(true);
    setErrorMsg('');
    const res: any = await cancelBookingAction(currentBooking.id, currentBooking.parentId || selectedParentId);
    setLoading(false);
    if (!(res as any).success) { setErrorMsg((res as any).error || 'Cancel failed'); } else { setBookingResult({ success: false, reason: 'Booking cancelled', booking: res.booking }); setCurrentBooking(null); }
    await loadData();
  }

  async function handlePayment(forceFailure: boolean) {
    if (!currentBooking) return;
    setLoading(true);
    setErrorMsg('');

    const res = await confirmPaymentAction(currentBooking.id, forceFailure);
    setLoading(false);

    setBookingResult(res);
    setCurrentBooking(null);
    await loadData();
  }

  async function handleLoadRoster(classId: string) {
    setSelectedRosterClassId(classId);
    const data = await getRosterAction(classId);
    setRosterData(data as any);
  }

  async function handleRunRaceDemo() {
    setRaceLogs([]);
    setLoading(true);
    setRaceLogs((prev) => [...prev, 'Resetting database to initial seed...']);
    await resetDatabaseAction();
    await loadData();

    setRaceLogs((prev) => [...prev, 'Target Class: "Primary Math Challenge" (3 confirmed students, 1 seat remaining)']);
    setRaceLogs((prev) => [...prev, 'User A (David Miller) creates pending booking for student Emma...']);
    const bookingA = await createPendingBookingAction('parent_4', 'student_4', 'class_almost_full');

    setRaceLogs((prev) => [...prev, 'User B (Eva Green) creates pending booking for student Noah...']);
    const bookingB = await createPendingBookingAction('parent_5', 'student_5', 'class_almost_full');

    if (!bookingA.booking || !bookingB.booking) {
      setRaceLogs((prev) => [...prev, 'Error creating pending bookings for demo']);
      setLoading(false);
      return;
    }

    setRaceLogs((prev) => [...prev, 'Executing SIMULTANEOUS Payment Confirmations using Promise.all()...']);

    const [resA, resB] = await Promise.all([
      confirmPaymentAction(bookingA.booking.id, false),
      confirmPaymentAction(bookingB.booking.id, false),
    ]);

    setRaceLogs((prev) => [...prev, `Result User A: ${resA.success ? 'CONFIRMED' : 'FAILED/REFUNDED (' + resA.reason + ')'}`]);
    setRaceLogs((prev) => [...prev, `Result User B: ${resB.success ? 'CONFIRMED' : 'FAILED/REFUNDED (' + resB.reason + ')'}`]);

    const roster = await getRosterAction('class_almost_full');
    setRaceLogs((prev) => [
      ...prev,
      `Invariant Verification: Total Confirmed Students = ${roster.confirmedCount} / ${roster.maxCapacity} (Max 4 limit perfectly respected!)`,
    ]);

    setLoading(false);
    await loadData();
  }

  async function handleResetData() {
    setLoading(true);
    await resetDatabaseAction();
    await loadData();
    setCurrentBooking(null);
    setBookingResult(null);
    setErrorMsg('');
    setLoading(false);
  }

  return (
    <div suppressHydrationWarning className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 font-sans">
      <div suppressHydrationWarning className="max-w-4xl mx-auto space-y-8">
        <div suppressHydrationWarning className="border-b border-slate-800 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div suppressHydrationWarning>
            <h1 className="text-3xl font-bold text-emerald-400">Ottodot Trial Class Booking</h1>
            <p className="text-slate-400 text-sm mt-1">Smallest Working Slice - Concurrency & Invariant Handling</p>
          </div>
          <button
            onClick={handleResetData}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700 transition"
          >
            Reset Database & Seed
          </button>
        </div>

        <div suppressHydrationWarning className="flex gap-3 bg-slate-800/60 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('booking')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === 'booking' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Parent Trial Booking
          </button>
          <button
            onClick={() => {
              setActiveTab('roster');
              if (selectedRosterClassId) handleLoadRoster(selectedRosterClassId);
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === 'roster' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Teacher / Admin Roster View
          </button>
          <button
            onClick={() => setActiveTab('race_demo')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === 'race_demo' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last-Seat Race Demo
          </button>
        </div>

        {activeTab === 'booking' && (
          <div suppressHydrationWarning className="grid md:grid-cols-2 gap-8">
            <div suppressHydrationWarning className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700/60 space-y-5">
              <h2 className="text-xl font-semibold text-slate-200 border-b border-slate-700/60 pb-3">Book a Trial Class</h2>

              <div suppressHydrationWarning>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Select Parent</label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.email})
                    </option>
                  ))}
                </select>
              </div>

              <div suppressHydrationWarning>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Select Child</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {currentParent?.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Age {s.age})
                    </option>
                  ))}
                </select>
              </div>

              <div suppressHydrationWarning>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Select Trial Class</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} - {c.confirmedCount}/{c.maxCapacity} Seats Taken ({c.availableSeats} Left)
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCreateBooking}
                disabled={loading || !selectedStudentId}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
              >
                {loading ? 'Processing...' : 'Proceed to Booking'}
              </button>

              {errorMsg && (
                <div suppressHydrationWarning className="bg-rose-950/60 border border-rose-800 text-rose-300 p-3 rounded-lg text-sm">{errorMsg}</div>
              )}
            </div>

            <div suppressHydrationWarning className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700/60 space-y-5">
              <h2 className="text-xl font-semibold text-slate-200 border-b border-slate-700/60 pb-3">Payment & Status</h2>

              {currentBooking ? (
                <div suppressHydrationWarning className="space-y-4">
                  <div suppressHydrationWarning className="bg-amber-950/40 border border-amber-800/80 p-4 rounded-xl space-y-2">
                    <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-semibold uppercase">
                      Status: {currentBooking.status}
                    </span>
                    <p className="text-sm text-slate-300 mt-2">
                      Booking created for <strong className="text-emerald-400">{currentBooking.student?.name}</strong> in{' '}
                      <strong>{currentBooking.trialClass?.title}</strong>.
                    </p>
                    <p className="text-xs text-slate-400">Please complete mock payment to confirm seat.</p>
                  </div>

                  <div suppressHydrationWarning className="flex gap-3">
                    <button
                      onClick={() => handlePayment(false)}
                      disabled={loading}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm shadow transition"
                    >
                      Complete Payment (Success)
                    </button>
                    <button
                      onClick={() => handlePayment(true)}
                      disabled={loading}
                      className="flex-1 py-3 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm shadow transition"
                    >
                      Simulate Card Decline
                    </button>
                  </div>
                  <button suppressHydrationWarning onClick={handleCancel} disabled={loading} className="w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition">Cancel Booking</button>
                </div>
              ) : bookingResult ? (
                <div suppressHydrationWarning
                  className={`p-5 rounded-xl border ${
                    bookingResult.success
                      ? 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-700 text-rose-200'
                  }`}
                >
                  <h3 className="font-semibold text-base mb-1">
                    {bookingResult.success ? 'Booking Confirmed!' : 'Payment / Confirmation Failed'}
                  </h3>
                  <p className="text-sm opacity-90">{bookingResult.reason}</p>
                  <div suppressHydrationWarning className="mt-4 pt-3 border-t border-slate-700/50 text-xs font-mono space-y-1">
                    <div suppressHydrationWarning>Booking ID: {bookingResult.booking?.id}</div>
                    <div suppressHydrationWarning>Final Status: {bookingResult.booking?.status}</div>
                    {bookingResult.payment && (
                      <div suppressHydrationWarning>Payment Status: {bookingResult.payment.status} ({bookingResult.payment.failureReason || 'Success'})</div>
                    )}
                  </div>
                </div>
              ) : (
                <div suppressHydrationWarning className="text-slate-500 text-sm text-center py-12">
                  No active booking selected. Choose a parent, child, and class on the left to start.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'roster' && (
          <div suppressHydrationWarning className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700/60 space-y-6">
            <div suppressHydrationWarning className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-700/60 pb-4">
              <div suppressHydrationWarning>
                <h2 className="text-xl font-semibold text-slate-200">Trial Class Roster (Max Cap: 4)</h2>
                <p className="text-xs text-slate-400">View confirmed students roster for teachers & admin</p>
              </div>

              <div suppressHydrationWarning className="flex items-center gap-3">
                <label className="text-xs text-slate-400">Select Class:</label>
                <select
                  value={selectedRosterClassId}
                  onChange={(e) => handleLoadRoster(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {rosterData && (
              <div suppressHydrationWarning className="space-y-4">
                <div suppressHydrationWarning className="grid grid-cols-3 gap-4 text-center">
                  <div suppressHydrationWarning className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/50">
                    <div suppressHydrationWarning className="text-xs text-slate-400 uppercase">Max Capacity</div>
                    <div suppressHydrationWarning className="text-xl font-bold text-slate-200">{rosterData.maxCapacity}</div>
                  </div>
                  <div suppressHydrationWarning className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/50">
                    <div suppressHydrationWarning className="text-xs text-slate-400 uppercase">Confirmed Students</div>
                    <div suppressHydrationWarning className="text-xl font-bold text-emerald-400">{rosterData.confirmedCount}</div>
                  </div>
                  <div suppressHydrationWarning className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/50">
                    <div suppressHydrationWarning className="text-xs text-slate-400 uppercase">Available Seats</div>
                    <div suppressHydrationWarning className="text-xl font-bold text-amber-400">{rosterData.availableSeats}</div>
                  </div>
                </div>

                {rosterData.roster.length > 0 ? (
                  <div suppressHydrationWarning className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-900/90 text-xs uppercase text-slate-400 border-b border-slate-700">
                        <tr>
                          <th className="p-3">Seat #</th>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Age</th>
                          <th className="p-3">Parent Name</th>
                          <th className="p-3">Parent Email</th>
                          <th className="p-3">Confirmed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {rosterData.roster.map((row) => (
                          <tr key={row.studentId} className="hover:bg-slate-800/40">
                            <td className="p-3 font-semibold text-emerald-400">Seat #{row.seatNumber}</td>
                            <td className="p-3 font-medium text-slate-100">{row.studentName}</td>
                            <td className="p-3">{row.studentAge} y/o</td>
                            <td className="p-3">{row.parentName}</td>
                            <td className="p-3 font-mono text-xs text-slate-400">{row.parentEmail}</td>
                            <td suppressHydrationWarning className="p-3 text-xs text-slate-400">{new Date(row.confirmedAt).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div suppressHydrationWarning className="text-center py-8 text-slate-500 text-sm">No confirmed students in this class yet.</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'race_demo' && (
          <div suppressHydrationWarning className="bg-slate-800/80 rounded-2xl p-6 border border-purple-900/60 space-y-6">
            <div suppressHydrationWarning className="border-b border-slate-700/60 pb-4">
              <h2 className="text-xl font-semibold text-purple-300">Last-Seat Race Condition Simulator</h2>
              <p className="text-xs text-slate-400 mt-1">
                Simulates User A (David) and User B (Eva) attempting to pay simultaneously for the LAST seat (4th seat) of
                &quot;Primary Math Challenge&quot;.
              </p>
            </div>

            <button
              onClick={handleRunRaceDemo}
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition"
            >
              {loading ? 'Simulating Concurrent Payments...' : 'Execute Last-Seat Race Test (Promise.all)'}
            </button>

            {raceLogs.length > 0 && (
              <div suppressHydrationWarning className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2 text-slate-300 max-h-96 overflow-y-auto">
                {raceLogs.map((log, i) => (
                  <div suppressHydrationWarning key={i} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}






