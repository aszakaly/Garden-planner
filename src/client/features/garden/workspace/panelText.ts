import { shortDate } from '@shared/domain/isoDate.ts';
import { fromSuffix } from '@shared/text.ts';

const bare = (iso: string) => shortDate(iso).replace(/\.$/, '');

/** „júl. 20-tól”, „okt. 5-től” */
export const fromDay = (iso: string) => `${bare(iso)}-${fromSuffix(Number(iso.slice(8, 10)))}`;

/** „máj. 10-ig” */
export const untilDay = (iso: string) => `${bare(iso)}-ig`;
