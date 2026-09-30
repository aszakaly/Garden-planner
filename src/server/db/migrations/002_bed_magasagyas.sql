-- Új ágyástípus: magaságyás (45 cm-nél magasabb keret).
-- Az „emelt ágyás” ettől kezdve az alacsony (kb. 15–20 cm-es) keretes ágyást jelenti.
-- SQLite-ban a CHECK-feltétel csak a tábla újraépítésével módosítható
-- (a migrációfuttató ehhez kikapcsolja az idegenkulcs-ellenőrzést, a végén pedig ellenőrzi).

CREATE TABLE bed_new (
  id               INTEGER PRIMARY KEY,
  garden_id        INTEGER NOT NULL REFERENCES garden(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL DEFAULT 'green',
  length_cm        INTEGER NOT NULL CHECK (length_cm > 0),
  width_cm         INTEGER NOT NULL CHECK (width_cm > 0),
  row_direction    TEXT NOT NULL DEFAULT 'keresztben' CHECK (row_direction IN ('keresztben', 'hosszaban')),
  pos_x_cm         INTEGER,
  pos_y_cm         INTEGER,
  rotation_deg     INTEGER NOT NULL DEFAULT 0,
  bed_type         TEXT NOT NULL DEFAULT 'foldagyas'
                   CHECK (bed_type IN ('foldagyas', 'emelt', 'magasagyas', 'folia', 'uveghaz', 'cserep')),
  sun              TEXT CHECK (sun IN ('napos', 'felarnyek', 'arnyek')),
  soil             TEXT,
  irrigation       TEXT,
  notes            TEXT,
  active_from_year INTEGER,
  active_to_year   INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

INSERT INTO bed_new (
  id, garden_id, name, color, length_cm, width_cm, row_direction, pos_x_cm, pos_y_cm, rotation_deg,
  bed_type, sun, soil, irrigation, notes, active_from_year, active_to_year, sort_order
)
SELECT
  id, garden_id, name, color, length_cm, width_cm, row_direction, pos_x_cm, pos_y_cm, rotation_deg,
  bed_type, sun, soil, irrigation, notes, active_from_year, active_to_year, sort_order
FROM bed;

DROP TABLE bed;
ALTER TABLE bed_new RENAME TO bed;
