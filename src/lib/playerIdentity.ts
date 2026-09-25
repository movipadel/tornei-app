// A certified UUID takes precedence over legacy phone-derived keys, including negative ownership.
export function ownsCircuitResult(row:{player_identity_id?:string|null;player_key:string},playerIds:readonly string[],legacyKeys:readonly string[]){
 return row.player_identity_id?playerIds.includes(row.player_identity_id):legacyKeys.includes(row.player_key);
}
