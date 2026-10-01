import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { FormButton, FormGroup } from '../../components/ui/Form.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { useBackups } from '../../lib/queries.ts';
import s from './SettingsPage.module.css';

const TABLE_LABEL: Record<string, string> = {
  plant: 'növény',
  variety: 'fajta',
  seed_stock: 'vetőmagtétel',
  bed: 'ágyás',
  planting: 'ültetés',
  journal_entry: 'naplóbejegyzés',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Mentések, JSON export és visszatöltés a Beállításokban. */
export function DataGroup() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: backups, refetch } = useBackups();
  const latest = backups?.files[0];

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await task() });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) ?? 'Ismeretlen hiba' });
    } finally {
      setBusy(false);
      refetch();
    }
  }

  const backupNow = () =>
    run(async () => `Mentés kész: ${(await api.post<{ file: string }>('/backups', {})).file}`);

  async function importFile(file: File) {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setMessage({ ok: false, text: 'A fájl nem olvasható JSON-ként.' });
      return;
    }
    const ok = confirm(
      'A visszatöltés minden jelenlegi adatot (növények, ágyások, tervek, napló, beállítások) lecserél a fájl tartalmára.\n\nElőtte automatikus mentés készül. Folytatod?',
    );
    if (!ok) return;
    await run(async () => {
      const res = await api.post<{ counts: Record<string, number>; backup: string | null }>('/import', data);
      await queryClient.invalidateQueries();
      const summary = Object.entries(TABLE_LABEL)
        .map(([t, label]) => `${res.counts[t] ?? 0} ${label}`)
        .join(', ');
      return `Visszatöltve: ${summary}.${res.backup ? ` A korábbi állapot mentése: ${res.backup}` : ''}`;
    });
  }

  return (
    <FormGroup
      title="Mentés és adatok"
      footer={
        <>
          A program induláskor (legfeljebb 6 óránként) magától is ment, és az utolsó 30 mentést őrzi meg
          {backups?.dir ? ` (helyük: ${backups.dir})` : ''}. A JSON-fájl az összes adatot tartalmazza – ezzel viheted át
          másik gépre, vagy töltheted vissza egy korábbi állapotot.
        </>
      }
    >
      <div className={s.dataStatus}>
        <span>Legutóbbi mentés</span>
        <span className={s.dataValue}>{latest ? `${when(latest.created)} · ${backups!.files.length} mentés` : 'még nincs'}</span>
      </div>
      <FormButton onClick={() => !busy && backupNow()}>Mentés most</FormButton>
      <FormButton onClick={() => (window.location.href = '/api/export')}>Exportálás JSON-fájlba</FormButton>
      <FormButton onClick={() => !busy && fileInput.current?.click()}>Visszatöltés JSON-fájlból…</FormButton>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) importFile(file);
        }}
      />
      {(busy || message) && (
        <p className={`${s.dataMessage} ${message && !message.ok ? s.dataError : ''}`} role="status">
          {busy ? 'Folyamatban…' : message?.text}
        </p>
      )}
    </FormGroup>
  );
}
