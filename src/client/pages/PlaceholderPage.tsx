import { Hammer } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import s from './PlaceholderPage.module.css';

interface Props {
  title: string;
  color?: string;
  step: string;
}

/** Ideiglenes oldal a még el nem készült nézetekhez. */
export function PlaceholderPage({ title, color, step }: Props) {
  return (
    <>
      <PageHeader title={title} color={color} />
      <div className={s.empty}>
        <Hammer size={34} strokeWidth={1.6} />
        <p className={s.lead}>Hamarosan</p>
        <p className={s.text}>Ez a nézet a megvalósítás {step} készül el.</p>
      </div>
    </>
  );
}
