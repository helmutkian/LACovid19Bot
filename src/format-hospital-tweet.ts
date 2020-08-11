import _ from 'lodash';
import moment from 'moment-timezone';
import * as E from 'fp-ts/lib/Either';
import * as A from 'fp-ts/lib/Array';
import { sequenceS } from 'fp-ts/lib/Apply';
import { pipe } from 'fp-ts/lib/pipeable';
import { HospitalizationRow } from './model';
import { parseInteger } from './util';

function movingAvg(rows: HospitalizationRow[], column: keyof HospitalizationRow, window: number): E.Either<Error, number> {
  return pipe(
    A.array.sequence(E.either)(
      rows
        .slice(0, window)
        .map(row => parseInteger(row[column]))
    ),
    E.map(cols => {
      const sum = _.sum(cols);

      return Math.round(sum / window);
    })
  )
}

function formatDiff(today: number, lastWeek: number): string {
  const diff = today - lastWeek;
  const pct = (Math.abs(diff) / lastWeek) * 100;

  return `${ (diff > 0 ? '\u2B06' : '\u2B07') }${ +pct.toFixed(1) }%`;
}

export default function format(rows: HospitalizationRow[]): E.Either<Error, string> {
  const sequenceSEither = sequenceS(E.either);
  const today = pipe(
    sequenceSEither({
      hospitalized_covid_confirmed_patients: parseInteger(rows[0].hospitalized_covid_confirmed_patients),
      hospitalized_suspected_covid_patients: parseInteger(rows[0].hospitalized_suspected_covid_patients),
      icu_covid_confirmed_patients: parseInteger(rows[0].icu_covid_confirmed_patients),
      icu_suspected_covid_patients: parseInteger(rows[0].icu_suspected_covid_patients),
      icu_available_beds: parseInteger(rows[0].icu_available_beds)
    }),
    E.map(numericData => ({
      ...rows[0],
      ...numericData
    }))
  );
  const todayAvgs = sequenceSEither({
    icuBeds7dAvg: movingAvg(rows, 'icu_available_beds', 7),
    confirmed7dAvg: movingAvg(rows, 'hospitalized_covid_confirmed_patients', 7),
    confirmedIcu7dAvg: movingAvg(rows, 'icu_covid_confirmed_patients', 7)
  });
  const lastWeekRows = rows.slice(7);
  const lastWeekAvgs = sequenceSEither({
    icuBeds7dAvg: movingAvg(lastWeekRows, 'icu_available_beds', 7),
    confirmed7dAvg: movingAvg(lastWeekRows, 'hospitalized_covid_confirmed_patients', 7),
    confirmedIcu7dAvg: movingAvg(lastWeekRows, 'icu_covid_confirmed_patients', 7)
  });

  return pipe(
    sequenceSEither({
      today,
      todayAvgs,
      lastWeekRows: E.right<Error, HospitalizationRow[]>(lastWeekRows),
      lastWeekAvgs
    }),
    E.chain(({ today, todayAvgs, lastWeekRows, lastWeekAvgs }) => 
      pipe(
        sequenceSEither({
          formattedDate: E.tryCatch(
            () => moment.tz(today.todays_date, 'America/Los_Angeles').format('M/D/YYYY'),
            err => err instanceof Error ? err : new Error('Unknown error.')
          ),
          lastWeekDate: E.tryCatch(
            () => moment.tz(lastWeekRows[0].todays_date, 'America/Los_Angeles').format('M/D'),
            err => err instanceof Error ? err : new Error('Unknown error.')
          )
        }),
        E.map(({ formattedDate, lastWeekDate }) => 
          [
            `COVID-19+ Hospitalizations\n${formattedDate}`,
            [
              `Patients: ${ today.hospitalized_covid_confirmed_patients } (+ ${ today.hospitalized_suspected_covid_patients } suspected)`,
              `7d avg: ${ todayAvgs.confirmed7dAvg }, ${ formatDiff(todayAvgs.confirmed7dAvg, lastWeekAvgs.confirmed7dAvg) }*`
            ].join('\n'),
            [
              `ICU Patients: ${ today.icu_covid_confirmed_patients } (+ ${ today.icu_suspected_covid_patients } suspected)`,
              `7d avg: ${ todayAvgs.confirmedIcu7dAvg }, ${ formatDiff(todayAvgs.confirmedIcu7dAvg, lastWeekAvgs.confirmedIcu7dAvg) }*`
            ].join('\n'),
            [
              `Avail ICU Beds: ${ today.icu_available_beds }`,
              `7d avg: ${ todayAvgs.icuBeds7dAvg }, ${ formatDiff(todayAvgs.icuBeds7dAvg, lastWeekAvgs.icuBeds7dAvg) }*`
            ].join('\n'),
            `* since ${ lastWeekDate }`
          ].join('\n\n')
        )
      )
    )
  );
}