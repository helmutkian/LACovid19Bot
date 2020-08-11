import * as E from 'fp-ts/lib/Either';
import { CaseData } from './model';

export default function format(dailyCases: CaseData): E.Either<Error, string> {
  const text = [
    `LA County COVID-19 ${ dailyCases.update } Update. Cases ${ dailyCases.info }.`,
    `Daily new cases: ${ dailyCases.dailyCases }`,
    `Daily new deaths: ${ dailyCases.dailyDeath }`,
    `Total cases: ${ dailyCases.totalCases }`,
    `Total deaths: ${ dailyCases.totalDeaths }`,
    `Total hospitalized: ${ dailyCases.totalHospitalized }`
  ].join('\n\n');

  return E.right(text);
}