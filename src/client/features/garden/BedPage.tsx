import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BED_TYPE_LABEL, ROW_DIRECTION_LABEL, SUN_LABEL } from '@shared/labels.ts';
import { Block, Fact, FactGrid, Muted } from '../../components/ui/Detail.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { formatArea, formatDimensions } from '../../lib/beds.ts';
import { colorVar } from '../../lib/colors.ts';
import { useBed } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
import { BedDiagram } from './BedDiagram.tsx';
import { BedEditSheet } from './BedEditSheet.tsx';
import s from './BedPage.module.css';

export function BedPage() {
  const id = Number(useParams().id);
  const { year } = useYear();
  const { data: bed, isLoading, error } = useBed(id);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <PageHeader title="Ágyás" back={{ to: '/kert', label: 'Kert' }} />;
  if (error || !bed) {
    return (
      <>
        <PageHeader title="Nem található" back={{ to: '/kert', label: 'Kert' }} />
        <p className={s.muted}>
          Ez az ágyás nem létezik. <Link to="/kert">Vissza a kerthez</Link>
        </p>
      </>
    );
  }

  const color = colorVar(bed.color);
  const inUse =
    bed.active_from_year || bed.active_to_year
      ? `${bed.active_from_year ?? '…'} – ${bed.active_to_year ?? 'jelenleg is'}`
      : 'folyamatosan';

  return (
    <div className={s.page}>
      <PageHeader
        title={bed.name}
        color={color}
        back={{ to: '/kert', label: 'Kert' }}
        subtitle={`${BED_TYPE_LABEL[bed.bed_type]} · ${formatDimensions(bed.length_cm, bed.width_cm)} · ${formatArea(bed.length_cm, bed.width_cm)}`}
        actions={
          <ToolbarButton label="Szerkesztés" onClick={() => setEditing(true)}>
            <Pencil size={17} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      <FactGrid>
        <Fact label="Méret" value={formatDimensions(bed.length_cm, bed.width_cm)} detail={formatArea(bed.length_cm, bed.width_cm)} />
        <Fact label="Sorok iránya" value={ROW_DIRECTION_LABEL[bed.row_direction]} />
        <Fact label="Napfény" value={bed.sun ? SUN_LABEL[bed.sun] : undefined} />
        <Fact label="Használatban" value={inUse} />
        <Fact label="Típus" value={BED_TYPE_LABEL[bed.bed_type]} />
        <Fact label="Talaj" value={bed.soil} />
        <Fact label="Öntözés" value={bed.irrigation} />
        <Fact
          label="Elhelyezkedés"
          value={bed.pos_x_cm != null && bed.pos_y_cm != null ? `${bed.pos_x_cm} / ${bed.pos_y_cm} cm` : undefined}
          detail={bed.rotation_deg ? `${bed.rotation_deg}°-kal elforgatva` : undefined}
        />
      </FactGrid>

      <Block title="Felülnézet">
        <BedDiagram lengthCm={bed.length_cm} widthCm={bed.width_cm} rowDirection={bed.row_direction} color={bed.color} />
      </Block>

      <Block title={`Ültetések ${year}`}>
        <Muted>
          Az éves tervben itt helyezed el a növényeket sávokban: idővonalon látszik, mikor melyik rész foglalt, és
          mi követheti egymást ugyanazon a helyen.
        </Muted>
      </Block>

      <Block title="Előzmények (vetésforgó)">
        <Muted>Az ágyás korábbi éveinek növényei – ezekből dolgozik a vetésforgó-ellenőrzés. Múltbeli évek is rögzíthetők lesznek.</Muted>
      </Block>

      {bed.notes && (
        <Block title="Megjegyzés">
          <p className={s.notes}>{bed.notes}</p>
        </Block>
      )}

      <BedEditSheet open={editing} onClose={() => setEditing(false)} bed={bed} />
    </div>
  );
}
