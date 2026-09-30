import {
  Bean,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Fence,
  Leaf,
  ListTodo,
  Plus,
  Search,
  Settings,
  Sprout,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router';
import { SmartTile } from '../components/ui/SmartTile.tsx';
import { SidebarRow } from '../components/ui/SidebarRow.tsx';
import { BED_ICON } from '../lib/beds.ts';
import { colorVar } from '../lib/colors.ts';
import { useBeds } from '../lib/queries.ts';
import { useYear } from '../lib/year.tsx';
import { MOCK_COUNTS } from '../mock/checkpoint.ts';
import s from './Sidebar.module.css';

export function Sidebar() {
  const { year, setYear } = useYear();
  const { data: beds = [] } = useBeds(year, true);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => thisYear - 6 + i);

  return (
    <nav className={s.sidebar} aria-label="Listák">
      <div className={s.brand}>
        <span className={s.appIcon} aria-hidden>
          <Sprout size={16} strokeWidth={2.6} />
        </span>
        <span className={s.appName}>Kerttervező</span>
        <label className={s.year}>
          <span className="visually-hidden">Tervezési év</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <ChevronDown size={13} strokeWidth={3} />
        </label>
      </div>

      <label className={s.search}>
        <Search size={15} strokeWidth={2.4} />
        <input type="search" placeholder="Keresés" />
      </label>

      <div className={s.tiles}>
        <SmartTile to="/het" icon={ListTodo} color="var(--c-blue)" label="Ez a hét" count={MOCK_COUNTS.week} />
        <SmartTile
          to="/utemezett"
          icon={CalendarClock}
          color="var(--c-red)"
          label="Ütemezett"
          count={MOCK_COUNTS.scheduled}
        />
        <SmartTile
          to="/naptar"
          icon={CalendarDays}
          color="var(--c-indigo)"
          label="Naptár"
          count={MOCK_COUNTS.calendar}
        />
        <SmartTile to="/terv" icon={Sprout} color="var(--c-green)" label="Éves terv" count={MOCK_COUNTS.plan} />
        <SmartTile
          to="/figyelmeztetesek"
          icon={TriangleAlert}
          color="var(--c-orange)"
          label="Figyelmeztetések"
          count={MOCK_COUNTS.warnings}
        />
        <SmartTile to="/naplo" icon={BookOpen} color="var(--c-brown)" label="Napló" count={MOCK_COUNTS.journal} />
      </div>

      <h2 className={s.heading}>Kertem</h2>
      <div className={s.group}>
        {beds.map((bed) => (
          <SidebarRow
            key={bed.id}
            to={`/agyas/${bed.id}`}
            icon={BED_ICON[bed.bed_type]}
            color={colorVar(bed.color)}
            label={bed.name}
            count={bed.planting_count}
          />
        ))}
        {beds.length === 0 && <p className={s.empty}>A kiválasztott évben nincs használt ágyás.</p>}
      </div>

      <h2 className={s.heading}>Adatok</h2>
      <div className={s.group}>
        <SidebarRow to="/novenyek" icon={Leaf} color="var(--c-mint)" label="Növények" />
        <SidebarRow to="/vetomag" icon={Bean} color="var(--c-purple)" label="Vetőmagkészlet" />
        <SidebarRow to="/kert" icon={Fence} color="var(--c-teal)" label="Kert és ágyások" />
        <SidebarRow to="/beallitasok" icon={Settings} color="var(--c-gray)" label="Beállítások" />
      </div>

      <Link to="/kert?uj=1" className={s.add}>
        <Plus size={16} strokeWidth={2.4} />
        Új ágyás
      </Link>
    </nav>
  );
}
