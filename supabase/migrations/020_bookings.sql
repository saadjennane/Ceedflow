-- Booking tool for candidate slot reservations (28-29 September).
-- Two days × four ranges × 15-min slots. One booking per slot AND per email.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS booking_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day DATE NOT NULL,
  start_time TEXT NOT NULL,   -- 'HH:MM' — display string, no TZ math
  end_time TEXT NOT NULL,
  sort_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (day, start_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id UUID NOT NULL REFERENCES booking_slots(id) ON DELETE CASCADE UNIQUE,
  startup_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_booking_slots_day ON booking_slots(day, sort_index);

ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Anyone can list free slots (public form).
DO $$ BEGIN
  CREATE POLICY "Anon read booking_slots"
    ON booking_slots FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage booking_slots"
    ON booking_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bookings are private (admin-only). Writes go through the API with service role.
DO $$ BEGIN
  CREATE POLICY "Authenticated manage bookings"
    ON bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed 54 slots (27 per day) from four ranges of 15-min slots:
-- 09:00–10:30, 10:45–12:15, 13:45–15:30, 15:45–17:45
INSERT INTO booking_slots (day, start_time, end_time, sort_index)
SELECT
  d.day,
  to_char(s.start_time, 'HH24:MI'),
  to_char(s.start_time + interval '15 min', 'HH24:MI'),
  ROW_NUMBER() OVER (PARTITION BY d.day ORDER BY s.start_time)
FROM (VALUES ('2026-09-28'::date), ('2026-09-29'::date)) d(day)
CROSS JOIN (VALUES
  (time '09:00'), (time '09:15'), (time '09:30'), (time '09:45'), (time '10:00'), (time '10:15'),
  (time '10:45'), (time '11:00'), (time '11:15'), (time '11:30'), (time '11:45'), (time '12:00'),
  (time '13:45'), (time '14:00'), (time '14:15'), (time '14:30'), (time '14:45'), (time '15:00'), (time '15:15'),
  (time '15:45'), (time '16:00'), (time '16:15'), (time '16:30'), (time '16:45'), (time '17:00'), (time '17:15'), (time '17:30')
) s(start_time)
ON CONFLICT (day, start_time) DO NOTHING;
