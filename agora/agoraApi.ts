// // lib/api/agora/agoraApi.ts

// import baseApi from "../baseApi";

// export interface GenerateAgoraTokenRequest {
//   channelName: string;
//   role: "publisher" | "subscriber";
//   userId: string;
// }

// export interface AgoraMeeting {
//   id: string;
//   meetingId: string;
//   password: string | null;
//   createdBy: string;
//   createdAt: string;
//   expiresAt: string;
//   isActive: boolean;
// }

// export interface GenerateAgoraTokenData {
//   token: string;
//   appId: string;
//   channelName: string;
//   uid: number;
//   meeting: AgoraMeeting;
// }

// export interface GenerateAgoraTokenResponse {
//   success: boolean;
//   message: string;
//   data: GenerateAgoraTokenData;
// }

// export const agoraApi = baseApi.injectEndpoints({
//   endpoints: (builder) => ({
//     generateAgoraToken: builder.mutation<
//       GenerateAgoraTokenResponse,
//       GenerateAgoraTokenRequest
//     >({
//       query: (body) => ({
//         url: "/agora/generate-token",
//         method: "POST",
//         body,
//       }),
//     }),
//   }),
// });

// export const { useGenerateAgoraTokenMutation } = agoraApi;


// //! grok 
// // lib/api/agora/agoraApi.ts
// import baseApi from "../baseApi";
// export interface GenerateAgoraTokenRequest {
//   channelName: string;
//   role: "publisher" | "subscriber";
//   userId: string;
// }
// export interface AgoraMeeting {
//   id: string;
//   meetingId: string;
//   password: string | null;
//   createdBy: string;
//   createdAt: string;
//   expiresAt: string;
//   isActive: boolean;
// }
// export interface GenerateAgoraTokenData {
//   token: string;
//   appId: string;
//   channelName: string;
//   uid: number;
//   meeting: AgoraMeeting;
// }
// export interface GenerateAgoraTokenResponse {
//   success: boolean;
//   message: string;
//   data: GenerateAgoraTokenData;
// }
// export const agoraApi = baseApi.injectEndpoints({
//   endpoints: (builder) => ({
//     generateAgoraToken: builder.mutation<
//       GenerateAgoraTokenResponse,
//       GenerateAgoraTokenRequest
//     >({
//       query: (body) => ({
//         url: "/agora/generate-token",
//         method: "POST",
//         body,
//       }),
//     }),
//   }),
// });
// export const { useGenerateAgoraTokenMutation } = agoraApi;


//? gpt 

// lib/api/agora/agoraApi.ts
import baseApi from '../baseApi';

export interface GenerateAgoraTokenRequest {
  channelName: string;
  role: 'publisher' | 'subscriber';
  userId: string;
}
export interface AgoraMeeting {
  id: string;
  meetingId: string;
  password: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
}
export interface GenerateAgoraTokenData {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
  meeting: AgoraMeeting;
}
export interface GenerateAgoraTokenResponse {
  success: boolean;
  message: string;
  data: GenerateAgoraTokenData;
}

export const agoraApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    generateAgoraToken: builder.mutation<GenerateAgoraTokenResponse, GenerateAgoraTokenRequest>({
      query: (body) => ({
        url: '/agora/generate-token',
        method: 'POST',
        body,
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGenerateAgoraTokenMutation } = agoraApi;
