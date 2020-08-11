export interface HospitalizationRow {
  icu_covid_confirmed_patients: string;
  icu_suspected_covid_patients: string;
  hospitalized_suspected_covid_patients: string;
  icu_available_beds: string;
  hospitalized_covid_confirmed_patients: string;
  todays_date: string;
}

export interface ParsedPageData {
  totalHospitalized: number;
}

export interface ParsedCounterData {
  totalCases: number;
  totalDeaths: number;
  dailyCases: number;
  dailyDeath: number;
  update: string;
  info: string;
  dataDate: string;
}

export type CaseData = ParsedPageData & ParsedCounterData & { hash: string };

export interface HospitalizationTweetData {
  type: 'hospital';
  data: {
    rows: HospitalizationRow[];
    hash: string;
  }
}

export interface CaseTweetData {
  type: 'case';
  data: CaseData;
}

export type TweetData = HospitalizationTweetData | CaseTweetData;