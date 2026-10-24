// Test examples only, not an exhaustive semantic validator. Avoid matching 의사표현/의사결정.
export const CAREER_PREDICTION_PATTERN =
  /(?<![가-힣])(?:의사|변호사|개발자|공무원|교사|회계사|간호사)(?=$|[^가-힣]|은|는|이|가|을|를|로|와|과|도|에|들|라)|(?:19|20)\d{2}\s*년|\d[\d,]*\s*(?:만|억)?\s*원/u;
