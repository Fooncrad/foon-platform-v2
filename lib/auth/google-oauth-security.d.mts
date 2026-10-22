export declare const GOOGLE_OAUTH_COOKIE_PATH:"/api/auth/google";
export declare function validGoogleOauthState(incoming:unknown,saved:unknown):boolean;
export declare function canUseGoogleLinkedAccount(user:{status?:string|null;email_verified_at?:string|Date|null}|null|undefined):boolean;
