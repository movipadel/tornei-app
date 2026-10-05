export const OPEN_PUBLIC_QR_EVENT = "movi:open-personal-qr";

export type OpenPublicQrDetail = {
  membershipCode?: string;
  returnFocus?: HTMLElement;
};
