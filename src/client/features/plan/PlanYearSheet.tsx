import { useEffect, useState } from 'react';
import { PLAN_YEAR_STATUS_LABEL, PLAN_YEAR_STATUSES, type PlanYearStatus } from '@shared/labels.ts';
import type { PlanYear } from '@shared/domain/planYear.ts';
import { FormGroup, FormRow, TextArea } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';

const STATUS_HINT: Record<PlanYearStatus, string> = {
  tervezes: 'Még tervezed az évet: mit, hová és mikor ültetsz.',
  aktiv: 'Az év folyamatban van: a feladatok pipálásával rögzíted, mi valósult meg.',
  lezart: 'Az év lezárult: a szezonvégi értékelések és a tények a következő évek tervezését segítik.',
};

/** A tervév állapota és jegyzete (célok, tanulságok). */
export function PlanYearSheet({ open, onClose, planYear }: { open: boolean; onClose: () => void; planYear: PlanYear }) {
  const [status, setStatus] = useState<PlanYearStatus>(planYear.status);
  const [notes, setNotes] = useState(planYear.notes ?? '');
  const save = useApiMutation(
    () => api.put<PlanYear>(`/plan-years/${planYear.year}`, { status, notes }),
    [qk.planYear(planYear.year)],
  );

  useEffect(() => {
    if (!open) return;
    setStatus(planYear.status);
    setNotes(planYear.notes ?? '');
  }, [open, planYear]);

  return (
    <Sheet
      title={`Tervév ${planYear.year}`}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(undefined, { onSuccess: onClose })}
      busy={save.isPending}
      error={errorMessage(save.error)}
    >
      <FormGroup title="Állapot" footer={STATUS_HINT[status]}>
        <FormRow label="Állapot" stacked hideLabel>
          <SegmentedControl<PlanYearStatus>
            label="Állapot"
            value={status}
            options={PLAN_YEAR_STATUSES.map((st) => ({ value: st, label: PLAN_YEAR_STATUS_LABEL[st] }))}
            onChange={setStatus}
          />
        </FormRow>
      </FormGroup>
      <FormGroup title="Jegyzet" footer="Az év céljai, ötletei, tanulságai – az Éves terv tetején jelenik meg.">
        <FormRow label="Jegyzet" stacked hideLabel>
          <TextArea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="pl. több bab a déli ágyásba, a paradicsomot korábban kipeckelni"
          />
        </FormRow>
      </FormGroup>
    </Sheet>
  );
}
