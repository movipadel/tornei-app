import type {
  BaraondaInput,
  GenerateBaraondaV2Result,
} from "../domain/types";

import { runBaraondaV2Engine } from "../engine";

export function generateBaraondaV2(
  input: BaraondaInput
): GenerateBaraondaV2Result {
  return runBaraondaV2Engine(input);
}