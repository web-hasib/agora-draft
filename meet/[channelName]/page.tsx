// // src/app/meeting/[channelName]/page.tsx
// "use client";
// import PageLoading from "@/components/ui/Loading";
// import { useGenerateAgoraTokenMutation } from "@/lib/api/agora/agoraApi";
// import { useGetUserQuery } from "@/lib/api/users/userApi";
// import AgoraRTC, {
//   IAgoraRTCClient,
//   IAgoraRTCRemoteUser,
//   ILocalAudioTrack,
//   ILocalVideoTrack,
//   IRemoteVideoTrack
// } from "agora-rtc-sdk-ng";
// import {
//   AlertTriangle,
//   Check,
//   Copy,
//   Loader2,
//   Maximize2,
//   Mic,
//   MicOff,
//   Minimize2,
//   MonitorUp,
//   PhoneOff,
//   Share2,
//   Users,
//   Video,
//   VideoOff,
// } from "lucide-react";
// import { useParams, useRouter } from "next/navigation";
// import React, {
//   MouseEvent,
//   useCallback,
//   useEffect,
//   useRef,
//   useState,
// } from "react";

// type RemoteUserState = {
//   user: IAgoraRTCRemoteUser;
//   hasVideo: boolean;
//   hasAudio: boolean;
//   uid: number;
//   isScreen?: boolean;
// };

// const RETRY_SUBSCRIBE_MS = 700;
// const MAX_SUBSCRIBE_RETRIES = 4;

// export default function MeetingRoom() {
//   const params = useParams();
//   const router = useRouter();
//   const channelName = (params?.channelName || "") as string;

//   const [generateToken, { isLoading: isGenerating }] =
//     useGenerateAgoraTokenMutation();

//   const { data, isLoading, isError } = useGetUserQuery();

//   const usersId = data?.data?.id;
//   // Agora refs
//   const clientRef = useRef<IAgoraRTCClient | null>(null);
//   const localVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
//   const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
//   const screenTrackRef = useRef<ILocalVideoTrack | null>(null);
//   const hasInitialized = useRef(false);

//   // DOM refs
//   const prejoinLocalRef = useRef<HTMLDivElement | null>(null);
//   const floatingPreviewRef = useRef<HTMLDivElement | null>(null);
//   const remoteVideoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
//   const fullScreenVideoRef = useRef<HTMLDivElement | null>(null);

//   // UI state
//   const [isJoined, setIsJoined] = useState(false);
//   const [isJoining, setIsJoining] = useState(false);
//   const [isMicOn, setIsMicOn] = useState(true);
//   const [isVideoOn, setIsVideoOn] = useState(true);
//   const [isScreenSharing, setIsScreenSharing] = useState(false);
//   const [remoteUsers, setRemoteUsers] = useState<Map<number, RemoteUserState>>(
//     new Map()
//   );
//   const [error, setError] = useState<string | null>(null);
//   const [copied, setCopied] = useState(false);
//   const [showShareModal, setShowShareModal] = useState(false);
//   const [fullScreenUser, setFullScreenUser] = useState<number | null>(null);

//   // floating preview drag
//   const floatRef = useRef<HTMLDivElement | null>(null);
//   const floatPos = useRef({ x: 16, y: 16 });
//   const dragStateRef = useRef<{
//     dragging: boolean;
//     startX: number;
//     startY: number;
//   } | null>(null);

//   // meeting link
//   const meetingLink =
//     typeof window !== "undefined"
//       ? `${window.location.origin}/meeting/${channelName}`
//       : "";

//   // --- Helper: log wrapper
//   const log = useCallback((...args: unknown[]) => {
//     console.log("[AgoraMeeting]", ...args);
//   }, []);

//   // --- Initialize Agora client (only once)
//   useEffect(() => {
//     if (!channelName || hasInitialized.current) return;
//     hasInitialized.current = true;

//     const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
//     clientRef.current = client;

//     log("Client created for channel:", channelName);

//     // connection state
//     client.on("connection-state-change", (cur, rev) => {
//       log("Connection state change:", cur, rev);
//     });

//     // user joined (presence) - add user even if not published yet
//     // This fixes the "Waiting for participants..." and participant count issue
//     client.on("user-joined", (user: IAgoraRTCRemoteUser) => {
//       log("user-joined:", user.uid);
//       setRemoteUsers((prev) => {
//         const copy = new Map(prev);
//         const uidNum = user.uid as number;
//         const existing = copy.get(uidNum);
//         if (existing) {
//           // update stored user object reference
//           existing.user = user;
//           existing.hasVideo = !!user.videoTrack || existing.hasVideo;
//           existing.hasAudio = !!user.audioTrack || existing.hasAudio;
//           copy.set(uidNum, existing);
//         } else {
//           copy.set(uidNum, {
//             user,
//             hasVideo: !!user.videoTrack,
//             hasAudio: !!user.audioTrack,
//             uid: uidNum,
//             isScreen: false,
//           });
//         }
//         return copy;
//       });
//     });

//     // user published
//     client.on(
//       "user-published",
//       async (user: IAgoraRTCRemoteUser, mediaType: string) => {
//         log("user-published event:", user.uid, mediaType);
//         await retrySubscribe(client, user, mediaType as "video" | "audio", 0);
//       }
//     );

//     // user unpublished
//     client.on(
//       "user-unpublished",
//       (user: IAgoraRTCRemoteUser, mediaType: string) => {
//         log("user-unpublished:", user.uid, mediaType);
//         setRemoteUsers((prev) => {
//           const copy = new Map(prev);
//           const uidNum = user.uid as number;
//           const existing = copy.get(uidNum);
//           if (!existing) return copy;
//           if (mediaType === "video") existing.hasVideo = false;
//           if (mediaType === "audio") existing.hasAudio = false;
//           if (!existing.hasVideo && !existing.hasAudio) {
//             copy.delete(uidNum);
//           } else {
//             copy.set(uidNum, existing);
//           }
//           return copy;
//         });
//       }
//     );

//     client.on("user-left", (user) => {
//       log("user-left:", user.uid);
//       setRemoteUsers((prev) => {
//         const copy = new Map(prev);
//         copy.delete(user.uid as number);
//         return copy;
//       });
//       if (fullScreenUser === user.uid) {
//         setFullScreenUser(null);
//       }
//     });

//     client.on("exception", (evt) => {
//       log("client exception:", evt);
//     });

//     // cleanup on unmount
//     return () => {
//       (async () => {
//         try {
//           log("Cleaning up client");
//           if (screenTrackRef.current) {
//             screenTrackRef.current.close();
//             screenTrackRef.current = null;
//           }
//           if (localAudioTrackRef.current) {
//             localAudioTrackRef.current.close();
//             localAudioTrackRef.current = null;
//           }
//           if (localVideoTrackRef.current) {
//             localVideoTrackRef.current.close();
//             localVideoTrackRef.current = null;
//           }
//           if (client) {
//             await client.leave();
//           }
//         } catch (err) {
//           console.error("Cleanup error:", err);
//         }
//       })();
//     };
//   }, [channelName, log, fullScreenUser]);

//   // --- create pre-join preview tracks (so preview appears immediately)
//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       try {
//         log("Creating prejoin preview tracks");

//         // Create audio track first
//         if (!localAudioTrackRef.current) {
//           const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
//           localAudioTrackRef.current = micTrack;
//           await micTrack.setEnabled(isMicOn);
//           log("Local microphone preview ready");
//         }

//         // Create video track
//         if (!localVideoTrackRef.current) {
//           const cameraTrack = await AgoraRTC.createCameraVideoTrack({
//             encoderConfig: { width: 640, height: 480, frameRate: 30 },
//           });
//           localVideoTrackRef.current = cameraTrack;

//           // First set enabled state, then play
//           await cameraTrack.setEnabled(isVideoOn);

//           if (prejoinLocalRef.current && mounted) {
//             // play preview in prejoin box with proper styling
//             cameraTrack.play(prejoinLocalRef.current, {
//               fit: "contain", // Ensure video fits without cropping
//             });
//             log("Local camera preview playing in prejoin element");
//           }
//         }
//       } catch (err: unknown) {
//         console.error("Prejoin track error:", err);
//         setError(
//           "Cannot access camera/microphone for preview. Please allow permissions."
//         );
//       }
//     })();
//     return () => {
//       mounted = false;
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []); // run once on mount

//   // --- helper to attempt subscribe with retries
//   const retrySubscribe = async (
//     client: IAgoraRTCClient,
//     user: IAgoraRTCRemoteUser,
//     mediaType: "video" | "audio",
//     attempt: number
//   ) => {
//     try {
//       log(
//         `Attempt subscribe ${attempt} -> user:${user.uid} media:${mediaType}`
//       );
//       await client.subscribe(user, mediaType);
//       log("Subscribed to remote user:", user.uid, mediaType);

//       if (mediaType === "video") {
//         const remoteVideo = user.videoTrack as IRemoteVideoTrack | undefined;
//         const isScreen = Boolean(
//           remoteVideo &&
//             ((remoteVideo as unknown as Record<string, unknown>)?.isScreen ||
//               (remoteVideo as unknown as Record<string, unknown>)?.source ||
//               (
//                 (
//                   (remoteVideo as unknown as Record<string, unknown>)
//                     ?.track as Record<string, unknown>
//                 )?.label as string
//               )
//                 ?.toLowerCase?.()
//                 ?.includes("screen"))
//         );

//         setRemoteUsers((prev) => {
//           const copy = new Map(prev);
//           const uidNum = user.uid as number;
//           const existing = copy.get(uidNum);
//           if (existing) {
//             existing.user = user;
//             existing.hasVideo = !!user.videoTrack;
//             existing.hasAudio = !!user.audioTrack;
//             existing.isScreen = isScreen || existing.isScreen;
//             copy.set(uidNum, existing);
//           } else {
//             copy.set(uidNum, {
//               user,
//               hasVideo: !!user.videoTrack,
//               hasAudio: !!user.audioTrack,
//               uid: uidNum,
//               isScreen,
//             });
//           }
//           return copy;
//         });

//         // Play remote video into registered DOM node if available
//         const videoRef = remoteVideoRefs.current.get(user.uid as number);
//         if (remoteVideo && videoRef) {
//           try {
//             // stop previous playback on that track then play
//             if (
//               "isPlaying" in remoteVideo &&
//               (remoteVideo as { isPlaying: boolean }).isPlaying
//             ) {
//               remoteVideo.stop();
//             }
//             remoteVideo.play(videoRef, {
//               fit: "contain", // Ensure video fits without cropping
//             });
//             log(
//               "Playing remote video for",
//               user.uid,
//               "into registered element"
//             );
//           } catch (err) {
//             console.warn("Could not play remote video immediately", err);
//           }
//         }

//         log("Remote video subscribed for", user.uid);
//       } else if (mediaType === "audio") {
//         user.audioTrack && user.audioTrack.play();
//         setRemoteUsers((prev) => {
//           const copy = new Map(prev);
//           const uidNum = user.uid as number;
//           const existing = copy.get(uidNum);
//           if (existing) {
//             existing.hasAudio = true;
//             existing.user = user;
//             copy.set(uidNum, existing);
//           } else {
//             copy.set(uidNum, {
//               user,
//               hasVideo: !!user.videoTrack,
//               hasAudio: true,
//               uid: uidNum,
//               isScreen: false,
//             });
//           }
//           return copy;
//         });
//         log("Remote audio playing for", user.uid);
//       }
//     } catch (err) {
//       console.warn(
//         "Subscribe failed for user",
//         user.uid,
//         "media",
//         mediaType,
//         "attempt",
//         attempt,
//         err
//       );
//       if (attempt < MAX_SUBSCRIBE_RETRIES) {
//         setTimeout(
//           () => retrySubscribe(client, user, mediaType, attempt + 1),
//           RETRY_SUBSCRIBE_MS * (attempt + 1)
//         );
//       } else {
//         console.error("Max subscribe retries reached for", user.uid, mediaType);
//       }
//     }
//   };

//   // Play video tracks when refs are available (keeps UI reactive)
//   useEffect(() => {
//     remoteUsers.forEach((state) => {
//       try {
//         if (state.hasVideo && state.user.videoTrack) {
//           const videoRef = remoteVideoRefs.current.get(state.uid);
//           if (videoRef && !state.user.videoTrack.isPlaying) {
//             state.user.videoTrack.play(videoRef, {
//               fit: "contain", // Ensure video fits without cropping
//             });
//             log("Playing remote video for", state.uid);
//           }
//         }
//       } catch (err) {
//         console.error("Error playing remote video", err);
//       }
//     });
//   }, [remoteUsers, log]);

//   // Handle full screen video playback
//   useEffect(() => {
//     if (fullScreenUser !== null) {
//       const fullScreenUserState = Array.from(remoteUsers.values()).find(
//         (user) => user.uid === fullScreenUser
//       );

//       if (
//         fullScreenUserState &&
//         fullScreenUserState.hasVideo &&
//         fullScreenUserState.user.videoTrack &&
//         fullScreenVideoRef.current
//       ) {
//         try {
//           // Stop playing in grid view temporarily
//           const gridVideoRef = remoteVideoRefs.current.get(
//             fullScreenUserState.uid
//           );
//           if (gridVideoRef) {
//             fullScreenUserState.user.videoTrack.stop();
//           }

//           // Play in full screen with proper fit
//           fullScreenUserState.user.videoTrack.play(fullScreenVideoRef.current, {
//             fit: "contain", // Ensure video fits without cropping
//           });
//           log("Playing full screen video for user:", fullScreenUser);
//         } catch (err) {
//           console.error("Error playing full screen video:", err);
//         }
//       }
//     } else {
//       // When exiting full screen, ensure videos play in grid view
//       remoteUsers.forEach((state) => {
//         if (state.hasVideo && state.user.videoTrack) {
//           const videoRef = remoteVideoRefs.current.get(state.uid);
//           if (videoRef && !state.user.videoTrack.isPlaying) {
//             state.user.videoTrack.play(videoRef, {
//               fit: "contain", // Ensure video fits without cropping
//             });
//           }
//         }
//       });
//     }
//   }, [fullScreenUser, remoteUsers, log]);

//   // --- Join meeting: reuse prejoin tracks if available
//   const joinMeeting = async () => {
//     setIsJoining(true);
//     setError(null);
//     const client = clientRef.current;
//     if (!client) {
//       setError("RTC client not ready");
//       setIsJoining(false);
//       return;
//     }

//     try {
//       const userId = usersId || "fa23522c-9c4d-4bbc-a902-f8f430014e89";
//       const role = "publisher";
//       log("Requesting token for channel:", channelName, "userId:", userId);
//       const response = await generateToken({
//         channelName,
//         userId,
//         role,
//       }).unwrap();
//       if (!response.success || !response.data) {
//         throw new Error(response.message || "Token generation failed");
//       }
//       const cfg = {
//         appId: response.data.appId,
//         token: response.data.token,
//         channel: response.data.channelName,
//         uid: response.data.uid,
//       };
//       log("Joining channel:", cfg.channel, "uid:", cfg.uid);

//       // join
//       await client.join(cfg.appId, cfg.channel, cfg.token, cfg.uid);
//       log("Successfully joined channel:", cfg.channel);

//       // Publish local tracks: reuse existing prejoin tracks to avoid flicker
//       const publishTracks: Array<ILocalAudioTrack | ILocalVideoTrack> = [];
//       if (!localAudioTrackRef.current) {
//         const mic = await AgoraRTC.createMicrophoneAudioTrack();
//         localAudioTrackRef.current = mic;
//         await mic.setEnabled(isMicOn);
//       } else {
//         await localAudioTrackRef.current.setEnabled(isMicOn);
//       }
//       if (!localVideoTrackRef.current) {
//         const cam = await AgoraRTC.createCameraVideoTrack({
//           encoderConfig: { width: 640, height: 480, frameRate: 30 },
//         });
//         localVideoTrackRef.current = cam;
//       } else {
//         await localVideoTrackRef.current.setEnabled(isVideoOn);
//       }

//       // Move playback from prejoin element to floating preview (stop first to ensure immediate play)
//       if (localVideoTrackRef.current && floatingPreviewRef.current) {
//         try {
//           // stop previous playback (prejoin) if playing and then play into floating preview
//           try {
//             if (
//               (
//                 localVideoTrackRef.current as ILocalVideoTrack & {
//                   isPlaying?: boolean;
//                 }
//               ).isPlaying
//             ) {
//               localVideoTrackRef.current.stop();
//             }
//           } catch (e) {
//             // ignore if not supported
//           }
//           localVideoTrackRef.current.play(floatingPreviewRef.current, {
//             fit: "contain", // Ensure video fits without cropping
//           });
//           log("Local video now playing in floating preview");
//         } catch (err) {
//           console.warn(
//             "Could not play local video in floating preview immediately",
//             err
//           );
//         }
//       }

//       publishTracks.push(localAudioTrackRef.current);
//       publishTracks.push(localVideoTrackRef.current);

//       await client.publish(publishTracks);
//       log("Published local audio & video tracks");

//       setIsJoined(true);
//       setShowShareModal(true);
//     } catch (err: unknown) {
//       console.error("Error joining meeting:", err);
//       let msg = "Failed to join meeting. Please try again.";
//       if (
//         typeof err === "object" &&
//         err !== null &&
//         "message" in err &&
//         typeof (err as { message: string }).message === "string"
//       ) {
//         const message = (err as { message: string }).message;
//         if (message.includes("PERMISSION_DENIED")) {
//           msg = "Camera/microphone permission denied.";
//         } else if (
//           message.includes("NotFoundError") ||
//           message.includes("NOT_FOUND")
//         ) {
//           msg = "Camera or microphone not found.";
//         } else {
//           msg = message;
//         }
//       }
//       setError(msg);
//     } finally {
//       setIsJoining(false);
//     }
//   };

//   // --- Toggle mic (works both pre-join and joined)
//   const toggleMic = async () => {
//     try {
//       const audio = localAudioTrackRef.current;
//       if (!audio) {
//         // try create
//         const mic = await AgoraRTC.createMicrophoneAudioTrack();
//         localAudioTrackRef.current = mic;
//         await mic.setEnabled(!isMicOn);
//         setIsMicOn((s) => !s);
//         return;
//       }
//       await audio.setEnabled(!isMicOn);
//       setIsMicOn((s) => !s);
//       log("Toggled mic. Now isMicOn:", !isMicOn);
//     } catch (err) {
//       console.error("Error toggling mic:", err);
//       setError("Cannot toggle microphone.");
//       setTimeout(() => setError(null), 3000);
//     }
//   };

//   // --- Toggle video (works pre-join too)
//   const toggleVideo = async () => {
//     try {
//       const video = localVideoTrackRef.current;
//       if (!video) {
//         const cam = await AgoraRTC.createCameraVideoTrack({
//           encoderConfig: { width: 640, height: 480, frameRate: 30 },
//         });
//         localVideoTrackRef.current = cam;
//         if (prejoinLocalRef.current) {
//           cam.play(prejoinLocalRef.current, {
//             fit: "contain", // Ensure video fits without cropping
//           });
//         }
//         await cam.setEnabled(true);
//         setIsVideoOn(true);
//         return;
//       }
//       await video.setEnabled(!isVideoOn);
//       setIsVideoOn((s) => !s);
//       log("Toggled video. Now isVideoOn:", !isVideoOn);
//     } catch (err) {
//       console.error("Error toggling video:", err);
//       setError("Cannot toggle camera.");
//       setTimeout(() => setError(null), 3000);
//     }
//   };

//   // --- Screen sharing (sharer sees own screen; viewers see full aspect)
//   const toggleScreenShare = async () => {
//     const client = clientRef.current;
//     if (!client) return;

//     try {
//       if (!isScreenSharing) {
//         log("Starting screen share: creating screen track");
//         const screenTrack = await AgoraRTC.createScreenVideoTrack({
//           encoderConfig: "1080p_1",
//         });
//         screenTrackRef.current = screenTrack as ILocalVideoTrack;

//         // Play screen share preview in floating window for the sharer
//         if (floatingPreviewRef.current && screenTrackRef.current) {
//           try {
//             if (
//               (
//                 screenTrackRef.current as ILocalVideoTrack & {
//                   isPlaying?: boolean;
//                 }
//               ).isPlaying
//             ) {
//               screenTrackRef.current.stop();
//             }
//           } catch (e) {}
//           screenTrackRef.current.play(floatingPreviewRef.current, {
//             fit: "contain", // Ensure screen share fits without cropping
//           });
//           log("Screen track playing in floating preview for presenter");
//         }

//         // Unpublish camera track and publish screen track
//         if (localVideoTrackRef.current) {
//           try {
//             await client.unpublish([localVideoTrackRef.current]);
//             log("Unpublished camera track to publish screen only");
//           } catch (e) {
//             console.warn(
//               "Could not unpublish camera before publishing screen",
//               e
//             );
//           }
//         }

//         await client.publish([screenTrack as ILocalVideoTrack]);
//         log("Published screen track to channel");

//         (screenTrack as ILocalVideoTrack).on("track-ended", async () => {
//           log("Screen share track ended (native event)");
//           await stopScreenShare();
//         });

//         setIsScreenSharing(true);
//       } else {
//         await stopScreenShare();
//       }
//     } catch (err: unknown) {
//       console.error("Screen share error:", err);
//       setError(
//         "Failed to share screen. Please allow screen-sharing permissions."
//       );
//       setTimeout(() => setError(null), 3000);
//     }
//   };

//   const stopScreenShare = async () => {
//     const client = clientRef.current;
//     const screenTrack = screenTrackRef.current;
//     if (!client || !screenTrack) return;

//     try {
//       await client.unpublish([screenTrack]);
//       screenTrack.close();
//       screenTrackRef.current = null;
//       log("Stopped and unpublished screen track");

//       if (localVideoTrackRef.current) {
//         await client.publish([localVideoTrackRef.current]);
//         if (floatingPreviewRef.current) {
//           try {
//             if (
//               (
//                 localVideoTrackRef.current as ILocalVideoTrack & {
//                   isPlaying?: boolean;
//                 }
//               ).isPlaying
//             ) {
//               localVideoTrackRef.current.stop();
//             }
//           } catch (e) {}
//           localVideoTrackRef.current.play(floatingPreviewRef.current, {
//             fit: "contain", // Ensure video fits without cropping
//           });
//         }
//         log("Re-published camera track after stopping screen");
//       }

//       setIsScreenSharing(false);
//     } catch (err) {
//       console.error("Error stopping screen share:", err);
//     }
//   };

//   // --- Leave meeting
//   const leaveCall = async () => {
//     const client = clientRef.current;
//     try {
//       if (isScreenSharing && screenTrackRef.current) {
//         await stopScreenShare();
//       }
//       if (localAudioTrackRef.current) {
//         localAudioTrackRef.current.close();
//         localAudioTrackRef.current = null;
//       }
//       if (localVideoTrackRef.current) {
//         localVideoTrackRef.current.close();
//         localVideoTrackRef.current = null;
//       }
//       if (client) {
//         await client.leave();
//         log("Left channel");
//       }
//     } catch (err) {
//       console.error("Error leaving call:", err);
//     } finally {
//       router.push("/meeting");
//     }
//   };

//   // --- copy link
//   const copyLink = async () => {
//     try {
//       await navigator.clipboard.writeText(meetingLink);
//       setCopied(true);
//       setTimeout(() => setCopied(false), 2000);
//     } catch (err) {
//       console.error("Copy failed", err);
//     }
//   };

//   // --- Toggle full screen for a user
//   const toggleFullScreen = (uid: number | null) => {
//     setFullScreenUser((prev) => (prev === uid ? null : uid));
//   };

//   // --- Check if there's any screen share from remote users
//   const hasRemoteScreenShare = Array.from(remoteUsers.values()).some(
//     (user) => user.isScreen
//   );

//   // Register video ref for a remote user
//   const registerVideoRef = (uid: number, element: HTMLDivElement | null) => {
//     if (element) {
//       remoteVideoRefs.current.set(uid, element);
//       // If user already has a videoTrack, play immediately
//       const state = remoteUsers.get(uid);
//       if (state && state.hasVideo && state.user.videoTrack) {
//         try {
//           if (!state.user.videoTrack.isPlaying) {
//             state.user.videoTrack.play(element, {
//               fit: "contain", // Ensure video fits without cropping
//             });
//             log("Playing remote video into newly registered element for", uid);
//           }
//         } catch (err) {
//           console.warn("Error playing remote video after registering ref", err);
//         }
//       }
//     } else {
//       remoteVideoRefs.current.delete(uid);
//     }
//   };

//   // --- Get the main content to display (either full screen user or regular grid)
//   const getMainContent = () => {
//     if (fullScreenUser !== null) {
//       const fullScreenUserState = Array.from(remoteUsers.values()).find(
//         (user) => user.uid === fullScreenUser
//       );

//       return (
//         <div className="flex-1 bg-black relative h-screen w-full">
//           <div className="w-full h-full flex items-center justify-center bg-black">
//             {fullScreenUserState && fullScreenUserState.hasVideo ? (
//               <div
//                 ref={fullScreenVideoRef}
//                 className="w-full h-full flex items-center justify-center"
//               />
//             ) : (
//               <div className="flex flex-col items-center justify-center text-white">
//                 <div className="w-32 h-32 rounded-full bg-slate-700 flex items-center justify-center mb-4">
//                   <span className="text-white font-semibold text-xl">
//                     {fullScreenUserState
//                       ? String(fullScreenUserState.uid)
//                           .slice(0, 2)
//                           .toUpperCase()
//                       : "??"}
//                   </span>
//                 </div>
//                 <p className="text-lg">Participant {fullScreenUser}</p>
//                 <p className="text-slate-400 mt-2">Video is not available</p>
//               </div>
//             )}
//           </div>

//           <div className="absolute top-4 right-4 flex gap-2">
//             <button
//               onClick={() => toggleFullScreen(fullScreenUser)}
//               className="p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
//               title="Exit full screen"
//             >
//               <Minimize2 className="w-5 h-5" />
//             </button>
//           </div>

//           {fullScreenUserState && (
//             <>
//               <div className="absolute bottom-4 left-4 bg-black/50 text-white px-4 py-2 rounded-full">
//                 <div className="text-sm font-medium">
//                   Participant {fullScreenUserState.uid}
//                   {fullScreenUserState.isScreen && (
//                     <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
//                       Screen Sharing
//                     </span>
//                   )}
//                 </div>
//               </div>

//               {!fullScreenUserState.hasAudio && (
//                 <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full">
//                   <MicOff className="w-4 h-4" />
//                 </div>
//               )}
//             </>
//           )}
//         </div>
//       );
//     }

//     return (
//       <div className="flex-1 p-4 overflow-auto h-full bg-slate-50">
//         {remoteUsers.size === 0 ? (
//           <div className="w-full h-full flex items-center justify-center bg-white rounded-lg min-h-[60vh]">
//             <div className="text-center">
//               <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
//               <h3 className="text-lg font-medium text-slate-600 mb-2">
//                 Waiting for participants to join
//               </h3>
//               <p className="text-slate-500">
//                 Share the meeting link to invite others
//               </p>
//             </div>
//           </div>
//         ) : (
//           <div
//             className={`grid gap-4 w-full h-full ${
//               remoteUsers.size === 1
//                 ? "grid-cols-1"
//                 : remoteUsers.size === 2
//                 ? "grid-cols-1 md:grid-cols-2"
//                 : remoteUsers.size <= 4
//                 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
//                 : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
//             }`}
//           >
//             {Array.from(remoteUsers.values()).map((s) => (
//               <div
//                 key={s.uid}
//                 className="relative bg-white border rounded-lg overflow-hidden min-h-[200px] md:min-h-[300px] shadow-sm"
//               >
//                 <div
//                   ref={(el) => registerVideoRef(s.uid, el)}
//                   className="w-full h-full bg-slate-50 remote-video-container"
//                 />
//                 {!s.hasVideo && (
//                   <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
//                     <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-200 flex items-center justify-center">
//                       <span className="text-slate-600 font-semibold text-sm md:text-base">
//                         {String(s.uid).slice(0, 2).toUpperCase()}
//                       </span>
//                     </div>
//                   </div>
//                 )}
//                 <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full shadow-sm flex items-center gap-2">
//                   <div className="text-sm font-medium">Participant {s.uid}</div>
//                   {s.isScreen && (
//                     <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
//                       Screen
//                     </span>
//                   )}
//                 </div>
//                 {!s.hasAudio && (
//                   <div className="absolute top-3 right-12 bg-red-600 text-white p-2 rounded-full">
//                     <MicOff className="w-3 h-3" />
//                   </div>
//                 )}
//                 <button
//                   onClick={() => toggleFullScreen(s.uid)}
//                   className="absolute top-3 right-3 bg-black/70 text-white p-2 rounded-full hover:bg-black/90 transition-colors"
//                   title="Maximize"
//                 >
//                   <Maximize2 className="w-4 h-4" />
//                 </button>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     );
//   };

//   // floating preview drag handlers
//   const onFloatMouseDown = (e: MouseEvent) => {
//     dragStateRef.current = {
//       dragging: true,
//       startX: e.clientX - floatPos.current.x,
//       startY: e.clientY - floatPos.current.y,
//     };
//   };
//   useEffect(() => {
//     const onMove = (e: MouseEvent) => {
//       if (!dragStateRef.current || !dragStateRef.current.dragging) return;
//       floatPos.current.x = e.clientX - dragStateRef.current.startX;
//       floatPos.current.y = e.clientY - dragStateRef.current.startY;
//       if (floatRef.current) {
//         floatRef.current.style.transform = `translate(${floatPos.current.x}px, ${floatPos.current.y}px)`;
//       }
//     };
//     const onUp = () => {
//       if (dragStateRef.current) dragStateRef.current.dragging = false;
//     };
//     window.addEventListener("mousemove", onMove as unknown as EventListener);
//     window.addEventListener("mouseup", onUp);
//     return () => {
//       window.removeEventListener(
//         "mousemove",
//         onMove as unknown as EventListener
//       );
//       window.removeEventListener("mouseup", onUp);
//     };
//   }, []);

//   if (isLoading) return <PageLoading />;
//   if (isError) return <div>something went wrong</div>;

//   // --- UI: Pre-join view
//   if (!isJoined) {
//     return (
//       <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
//         <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg p-6">
//           <div className="flex items-center justify-between mb-6">
//             <div>
//               <h2 className="text-xl font-semibold text-slate-800">
//                 Ready to join
//               </h2>
//               <p className="text-sm text-slate-500 mt-1">
//                 Meeting ID:{" "}
//                 <span className="font-mono text-slate-700">{channelName}</span>
//               </p>
//             </div>
//             <div className="flex items-center gap-2">
//               <button
//                 onClick={() => setShowShareModal(true)}
//                 className="px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-700 transition-colors"
//               >
//                 <Share2 className="w-4 h-4" />
//                 Share
//               </button>
//             </div>
//           </div>

//           {error && (
//             <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-3">
//               <AlertTriangle className="w-5 h-5 flex-shrink-0" />
//               <div className="text-sm">{error}</div>
//             </div>
//           )}

//           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
//             <div className="space-y-4">
//               <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative border">
//                 <div ref={prejoinLocalRef} className="w-full h-full" />
//                 {!isVideoOn && (
//                   <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
//                     <div className="w-24 h-24 bg-slate-300 rounded-full flex items-center justify-center shadow-sm">
//                       <span className="text-slate-600 font-semibold text-lg">
//                         You
//                       </span>
//                     </div>
//                   </div>
//                 )}
//               </div>

//               <div className="flex items-center justify-center gap-4">
//                 <button
//                   onClick={toggleMic}
//                   className={`p-4 rounded-full border-2 transition-all ${
//                     isMicOn
//                       ? "bg-white border-slate-200 hover:border-slate-300"
//                       : "bg-red-50 border-red-200 hover:border-red-300"
//                   }`}
//                   title={isMicOn ? "Mute" : "Unmute"}
//                 >
//                   {isMicOn ? (
//                     <Mic className="w-6 h-6 text-slate-700" />
//                   ) : (
//                     <MicOff className="w-6 h-6 text-red-600" />
//                   )}
//                 </button>

//                 <button
//                   onClick={toggleVideo}
//                   className={`p-4 rounded-full border-2 transition-all ${
//                     isVideoOn
//                       ? "bg-white border-slate-200 hover:border-slate-300"
//                       : "bg-red-50 border-red-200 hover:border-red-300"
//                   }`}
//                   title={isVideoOn ? "Stop Video" : "Start Video"}
//                 >
//                   {isVideoOn ? (
//                     <Video className="w-6 h-6 text-slate-700" />
//                   ) : (
//                     <VideoOff className="w-6 h-6 text-red-600" />
//                   )}
//                 </button>
//               </div>
//             </div>

//             <div className="space-y-6">
//               <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
//                 <h3 className="text-lg font-medium text-slate-800">
//                   Meeting Details
//                 </h3>

//                 <div className="space-y-3">
//                   <div className="flex justify-between text-sm">
//                     <span className="text-slate-600">Participants:</span>
//                     <span className="font-medium text-slate-800">
//                       {remoteUsers.size + (isJoined ? 1 : 0)}
//                     </span>
//                   </div>
//                   <div className="flex justify-between text-sm">
//                     <span className="text-slate-600">Video:</span>
//                     <span
//                       className={`font-medium ${
//                         isVideoOn ? "text-green-600" : "text-red-600"
//                       }`}
//                     >
//                       {isVideoOn ? "On" : "Off"}
//                     </span>
//                   </div>
//                   <div className="flex justify-between text-sm">
//                     <span className="text-slate-600">Microphone:</span>
//                     <span
//                       className={`font-medium ${
//                         isMicOn ? "text-green-600" : "text-red-600"
//                       }`}
//                     >
//                       {isMicOn ? "On" : "Off"}
//                     </span>
//                   </div>
//                 </div>

//                 <p className="text-sm text-slate-500 pt-2 border-t border-slate-200">
//                   Check your camera and microphone settings before joining the
//                   meeting.
//                 </p>
//               </div>

//               <div className="flex gap-3">
//                 <button
//                   onClick={() => router.push("/meeting")}
//                   className="flex-1 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
//                   disabled={isJoining || isGenerating}
//                 >
//                   Cancel
//                 </button>
//                 <button
//                   onClick={joinMeeting}
//                   className="flex-1 py-3 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
//                   disabled={isJoining || isGenerating}
//                 >
//                   {isJoining || isGenerating ? (
//                     <>
//                       <Loader2 className="w-5 h-5 animate-spin" />
//                       Joining...
//                     </>
//                   ) : (
//                     "Join Meeting"
//                   )}
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>

//         {showShareModal && (
//           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
//             <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
//               <div className="flex items-center justify-between mb-4">
//                 <h4 className="font-semibold text-slate-800 text-lg">
//                   Share Meeting Link
//                 </h4>
//                 <button
//                   onClick={() => setShowShareModal(false)}
//                   className="text-slate-500 hover:text-slate-700 transition-colors"
//                 >
//                   ✕
//                 </button>
//               </div>
//               <div className="mb-4">
//                 <input
//                   readOnly
//                   value={meetingLink}
//                   className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 />
//               </div>
//               <div className="flex gap-3">
//                 <button
//                   onClick={copyLink}
//                   className="flex-1 py-3 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-medium"
//                 >
//                   {copied ? (
//                     <>
//                       <Check className="w-5 h-5" />
//                       Copied
//                     </>
//                   ) : (
//                     <>
//                       <Copy className="w-5 h-5" />
//                       Copy Link
//                     </>
//                   )}
//                 </button>
//                 <button
//                   onClick={() => setShowShareModal(false)}
//                   className="py-3 px-6 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
//                 >
//                   Close
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}
//       </div>
//     );
//   }

//   // --- Meeting UI when joined
//   return (
//     <>
//       {showShareModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
//           <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
//             <div className="flex items-center justify-between mb-4">
//               <h4 className="font-semibold text-slate-800 text-lg">
//                 Share Meeting Link
//               </h4>
//               <button
//                 onClick={() => setShowShareModal(false)}
//                 className="text-slate-500 hover:text-slate-700 transition-colors"
//               >
//                 ✕
//               </button>
//             </div>
//             <div className="mb-4">
//               <input
//                 readOnly
//                 value={meetingLink}
//                 className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               />
//             </div>
//             <div className="flex gap-3">
//               <button
//                 onClick={copyLink}
//                 className="flex-1 py-3 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-medium"
//               >
//                 {copied ? (
//                   <>
//                     <Check className="w-5 h-5" />
//                     Copied
//                   </>
//                 ) : (
//                   <>
//                     <Copy className="w-5 h-5" />
//                     Copy Link
//                   </>
//                 )}
//               </button>
//               <button
//                 onClick={() => setShowShareModal(false)}
//                 className="py-3 px-6 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
//               >
//                 Close
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       <div className="min-h-screen bg-slate-50 flex flex-col h-screen">
//         <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-sm">
//           <div className="flex items-center gap-4">
//             <Users className="w-5 h-5 text-slate-600" />
//             <div className="text-slate-800 font-medium">
//               {remoteUsers.size + 1} participant
//               {remoteUsers.size !== 0 ? "s" : ""}
//             </div>
//             {hasRemoteScreenShare && (
//               <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
//                 Screen sharing
//               </span>
//             )}
//             {fullScreenUser && (
//               <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
//                 Full screen
//               </span>
//             )}
//           </div>

//           <div className="flex items-center gap-3">
//             <button
//               onClick={() => setShowShareModal(true)}
//               className="px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-700 transition-colors font-medium"
//             >
//               <Share2 className="w-4 h-4" />
//               Share
//             </button>
//             <button
//               onClick={leaveCall}
//               title="Leave meeting"
//               className="p-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
//             >
//               <PhoneOff className="w-5 h-5" />
//             </button>
//           </div>
//         </div>

//         <div className="flex-1 overflow-hidden">{getMainContent()}</div>

//         {fullScreenUser === null && (
//           <div
//             ref={floatRef}
//             onMouseDown={
//               onFloatMouseDown as (e: React.MouseEvent<HTMLDivElement>) => void
//             }
//             style={{
//               position: "fixed",
//               bottom: 16,
//               left: 16,
//               transform: `translate(${floatPos.current.x}px, ${floatPos.current.y}px)`,
//               zIndex: 50,
//             }}
//             className="w-40 h-28 md:w-56 md:h-36 bg-white border-2 border-blue-500 rounded-xl shadow-xl cursor-grab overflow-hidden hover:border-blue-600 transition-colors"
//           >
//             <div className="w-full h-full relative">
//               <div
//                 ref={floatingPreviewRef}
//                 className="w-full h-full bg-slate-100"
//                 style={{ pointerEvents: "none" }}
//               />
//               {!isVideoOn && !isScreenSharing && (
//                 <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
//                   <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-300 rounded-full flex items-center justify-center shadow-sm">
//                     <span className="text-slate-600 text-xs font-semibold">
//                       You
//                     </span>
//                   </div>
//                 </div>
//               )}
//               <div className="absolute bottom-2 left-2 bg-black/80 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
//                 You {isScreenSharing ? "(Presenting)" : ""}
//               </div>
//               {isScreenSharing && (
//                 <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium">
//                   <MonitorUp className="w-3 h-3" />
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         <div className="bg-white border-t p-4 flex-shrink-0 shadow-lg">
//           <div className="max-w-4xl mx-auto flex items-center justify-center gap-4 flex-wrap">
//             <button
//               onClick={toggleMic}
//               className={`p-4 rounded-full border-2 transition-all ${
//                 isMicOn
//                   ? "bg-white border-slate-300 hover:border-slate-400"
//                   : "bg-red-50 border-red-300 hover:border-red-400"
//               }`}
//               title={isMicOn ? "Mute" : "Unmute"}
//             >
//               {isMicOn ? (
//                 <Mic className="w-6 h-6 text-slate-700" />
//               ) : (
//                 <MicOff className="w-6 h-6 text-red-600" />
//               )}
//             </button>

//             <button
//               onClick={toggleVideo}
//               className={`p-4 rounded-full border-2 transition-all ${
//                 isVideoOn
//                   ? "bg-white border-slate-300 hover:border-slate-400"
//                   : "bg-red-50 border-red-300 hover:border-red-400"
//               }`}
//               title={isVideoOn ? "Stop Video" : "Start Video"}
//             >
//               {isVideoOn ? (
//                 <Video className="w-6 h-6 text-slate-700" />
//               ) : (
//                 <VideoOff className="w-6 h-6 text-red-600" />
//               )}
//             </button>

//             <button
//               onClick={toggleScreenShare}
//               className={`p-4 rounded-full border-2 transition-all ${
//                 isScreenSharing
//                   ? "bg-blue-50 border-blue-500 hover:border-blue-600"
//                   : "bg-white border-slate-300 hover:border-slate-400"
//               }`}
//               title={isScreenSharing ? "Stop sharing" : "Share screen"}
//             >
//               <MonitorUp
//                 className={`w-6 h-6 ${
//                   isScreenSharing ? "text-blue-600" : "text-slate-700"
//                 }`}
//               />
//             </button>

//             <button
//               onClick={leaveCall}
//               className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors ml-2"
//               title="Leave"
//             >
//               <PhoneOff className="w-6 h-6" />
//             </button>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }

// src/app/meet/[channelName]/page.tsx
"use client";
import PageLoading from "@/components/ui/Loading";
import { useGenerateAgoraTokenMutation } from "@/lib/api/agora/agoraApi";
import { useGetUserQuery } from "@/lib/api/users/userApi";
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PhoneOff,
  Share2,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, {
  MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type RemoteUserState = {
  user: IAgoraRTCRemoteUser;
  hasVideo: boolean;
  hasAudio: boolean;
  uid: number;
  isScreen?: boolean;
};

const RETRY_SUBSCRIBE_MS = 700;
const MAX_SUBSCRIBE_RETRIES = 4;

export default function MeetingRoom() {
  const params = useParams();
  const router = useRouter();
  const channelName = (params?.channelName || "") as string;

  const [generateToken, { isLoading: isGenerating }] =
    useGenerateAgoraTokenMutation();

  const { data, isLoading, isError } = useGetUserQuery();

  const usersId = data?.data?.id;
  // Agora refs
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null);
  const hasInitialized = useRef(false);
  const isLeavingRef = useRef(false);

  // DOM refs
  const prejoinLocalRef = useRef<HTMLDivElement | null>(null);
  const floatingPreviewRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const fullScreenVideoRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<Map<number, RemoteUserState>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [fullScreenUser, setFullScreenUser] = useState<number | null>(null);

  // floating preview drag
  const floatRef = useRef<HTMLDivElement | null>(null);
  const floatPos = useRef({ x: 16, y: 16 });
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  // meeting link
  const meetingLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/meet/${channelName}`
      : "";

  // --- Helper: log wrapper
  const log = useCallback((...args: unknown[]) => {
    console.log("[AgoraMeeting]", ...args);
  }, []);

  // --- Create pre-join preview tracks immediately
  useEffect(() => {
    let mounted = true;
    let cleanupTriggered = false;

    const createPrejoinTracks = async () => {
      if (cleanupTriggered) return;

      try {
        log("Creating prejoin preview tracks");

        // Create video track first (camera)
        if (!localVideoTrackRef.current) {
          try {
            const cameraTrack = await AgoraRTC.createCameraVideoTrack({
              encoderConfig: { width: 640, height: 480, frameRate: 30 },
            });

            if (!mounted) {
              cameraTrack.close();
              return;
            }

            localVideoTrackRef.current = cameraTrack;
            await cameraTrack.setEnabled(true);

            // Wait for DOM element to be available
            const waitForElement = () => {
              if (prejoinLocalRef.current) {
                try {
                  cameraTrack.play(prejoinLocalRef.current, {
                    fit: "cover",
                  });
                  log("Local camera preview playing in prejoin element");
                } catch (playErr) {
                  console.warn("Could not play in prejoin element:", playErr);
                  setTimeout(waitForElement, 100);
                }
              } else {
                setTimeout(waitForElement, 100);
              }
            };

            waitForElement();
            log("Local camera preview ready");
          } catch (cameraErr) {
            console.error("Camera error:", cameraErr);
            setError(
              "Cannot access camera for preview. Please allow permissions."
            );
          }
        }

        // Create audio track
        if (!localAudioTrackRef.current) {
          try {
            const micTrack = await AgoraRTC.createMicrophoneAudioTrack();

            if (!mounted) {
              micTrack.close();
              return;
            }

            localAudioTrackRef.current = micTrack;
            await micTrack.setEnabled(false); // Start muted
            log("Local microphone preview ready");
          } catch (micErr) {
            console.warn("Microphone error:", micErr);
            // Continue without mic
          }
        }
      } catch (err: unknown) {
        console.error("Prejoin track error:", err);
        if (mounted) {
          setError(
            "Cannot access camera/microphone for preview. Please allow permissions."
          );
        }
      }
    };

    createPrejoinTracks();

    return () => {
      mounted = false;
      cleanupTriggered = true;
    };
  }, [log]);

  // Re-attach video to prejoin element when ref changes
  useEffect(() => {
    if (prejoinLocalRef.current && localVideoTrackRef.current && !isJoined) {
      try {
        if (localVideoTrackRef.current.isPlaying) {
          localVideoTrackRef.current.stop();
        }
        localVideoTrackRef.current.play(prejoinLocalRef.current, {
          fit: "cover",
        });
      } catch (err) {
        console.warn("Error re-attaching prejoin video:", err);
      }
    }
  }, [isJoined]);

  // --- Initialize Agora client (only once)
  useEffect(() => {
    if (!channelName || hasInitialized.current) return;
    hasInitialized.current = true;

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    log("Client created for channel:", channelName);

    // connection state
    client.on("connection-state-change", (cur, rev) => {
      log("Connection state change:", cur, rev);
    });

    // user joined (presence) - add user even if not published yet
    client.on("user-joined", (user: IAgoraRTCRemoteUser) => {
      log("user-joined:", user.uid);
      setRemoteUsers((prev) => {
        const copy = new Map(prev);
        const uidNum = Number(user.uid);
        const existing = copy.get(uidNum);
        if (existing) {
          // update stored user object reference
          existing.user = user;
          existing.hasVideo = !!user.videoTrack || existing.hasVideo;
          existing.hasAudio = !!user.audioTrack || existing.hasAudio;
          copy.set(uidNum, existing);
        } else {
          copy.set(uidNum, {
            user,
            hasVideo: !!user.videoTrack,
            hasAudio: !!user.audioTrack,
            uid: uidNum,
            isScreen: false,
          });
        }
        return copy;
      });
    });

    // user published
    client.on(
      "user-published",
      async (user: IAgoraRTCRemoteUser, mediaType: string) => {
        log("user-published event:", user.uid, mediaType);
        await retrySubscribe(client, user, mediaType as "video" | "audio", 0);
      }
    );

    // user unpublished
    client.on(
      "user-unpublished",
      (user: IAgoraRTCRemoteUser, mediaType: string) => {
        log("user-unpublished:", user.uid, mediaType);
        setRemoteUsers((prev) => {
          const copy = new Map(prev);
          const uidNum = Number(user.uid);
          const existing = copy.get(uidNum);
          if (!existing) return copy;
          if (mediaType === "video") existing.hasVideo = false;
          if (mediaType === "audio") existing.hasAudio = false;
          if (!existing.hasVideo && !existing.hasAudio) {
            copy.delete(uidNum);
          } else {
            copy.set(uidNum, existing);
          }
          return copy;
        });
      }
    );

    client.on("user-left", (user) => {
      log("user-left:", user.uid);
      setRemoteUsers((prev) => {
        const copy = new Map(prev);
        copy.delete(Number(user.uid));
        return copy;
      });
      if (fullScreenUser === Number(user.uid)) {
        setFullScreenUser(null);
      }
    });

    client.on("exception", (evt) => {
      log("client exception:", evt);
    });

    // cleanup on unmount
    return () => {
      if (isLeavingRef.current) return;

      (async () => {
        try {
          log("Cleaning up client");
          if (screenTrackRef.current) {
            screenTrackRef.current.close();
            screenTrackRef.current = null;
          }
          if (localAudioTrackRef.current) {
            localAudioTrackRef.current.close();
            localAudioTrackRef.current = null;
          }
          if (localVideoTrackRef.current) {
            localVideoTrackRef.current.close();
            localVideoTrackRef.current = null;
          }
          if (client && client.connectionState !== "DISCONNECTED") {
            await client.leave();
          }
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      })();
    };
  }, [channelName, log, fullScreenUser]);

  // --- helper to attempt subscribe with retries
  const retrySubscribe = async (
    client: IAgoraRTCClient,
    user: IAgoraRTCRemoteUser,
    mediaType: "video" | "audio",
    attempt: number
  ) => {
    try {
      log(
        `Attempt subscribe ${attempt} -> user:${user.uid} media:${mediaType}`
      );
      await client.subscribe(user, mediaType);
      log("Subscribed to remote user:", user.uid, mediaType);

      if (mediaType === "video") {
        const remoteVideo = user.videoTrack as IRemoteVideoTrack | undefined;
        const uidNum = Number(user.uid);

        // Check if it's screen share
        let isScreen = false;
        if (remoteVideo ) {
          const track = remoteVideo as unknown as { track?: { label?: string  }, isScreen?: boolean };
          const label = track.track?.label?.toLowerCase?.() || "";
          isScreen = label.includes("screen") || track.isScreen || false;
        }

        setRemoteUsers((prev) => {
          const copy = new Map(prev);
          const existing = copy.get(uidNum);
          if (existing) {
            existing.user = user;
            existing.hasVideo = true;
            existing.isScreen = isScreen || existing.isScreen;
            copy.set(uidNum, existing);
          } else {
            copy.set(uidNum, {
              user,
              hasVideo: true,
              hasAudio: !!user.audioTrack,
              uid: uidNum,
              isScreen,
            });
          }
          return copy;
        });

        // Play remote video into registered DOM node if available
        const videoRef = remoteVideoRefs.current.get(uidNum);
        if (remoteVideo && videoRef) {
          try {
            remoteVideo.play(videoRef, {
              fit: "cover",
            });
            log(
              "Playing remote video for",
              user.uid,
              "into registered element"
            );
          } catch (err) {
            console.warn("Could not play remote video immediately", err);
          }
        }

        log("Remote video subscribed for", user.uid);
      } else if (mediaType === "audio") {
        const uidNum = Number(user.uid);
        const remoteAudio = user.audioTrack as IRemoteAudioTrack | undefined;

        if (remoteAudio) {
          remoteAudio.play();
        }

        setRemoteUsers((prev) => {
          const copy = new Map(prev);
          const existing = copy.get(uidNum);
          if (existing) {
            existing.hasAudio = true;
            existing.user = user;
            copy.set(uidNum, existing);
          } else {
            copy.set(uidNum, {
              user,
              hasVideo: !!user.videoTrack,
              hasAudio: true,
              uid: uidNum,
              isScreen: false,
            });
          }
          return copy;
        });
        log("Remote audio playing for", user.uid);
      }
    } catch (err) {
      console.warn(
        "Subscribe failed for user",
        user.uid,
        "media",
        mediaType,
        "attempt",
        attempt,
        err
      );
      if (attempt < MAX_SUBSCRIBE_RETRIES) {
        setTimeout(
          () => retrySubscribe(client, user, mediaType, attempt + 1),
          RETRY_SUBSCRIBE_MS * (attempt + 1)
        );
      } else {
        console.error("Max subscribe retries reached for", user.uid, mediaType);
      }
    }
  };

  // Play video tracks when refs are available (keeps UI reactive)
  useEffect(() => {
    remoteUsers.forEach((state) => {
      try {
        if (state.hasVideo && state.user.videoTrack) {
          const videoRef = remoteVideoRefs.current.get(state.uid);
          if (videoRef) {
            const remoteVideo = state.user.videoTrack as IRemoteVideoTrack;
            if (!remoteVideo.isPlaying) {
              remoteVideo.play(videoRef, {
                fit: "cover",
              });
              log("Playing remote video for", state.uid);
            }
          }
        }
      } catch (err) {
        console.error("Error playing remote video", err);
      }
    });
  }, [remoteUsers, log]);

  // Handle full screen video playback and restore grid view
  useEffect(() => {
    if (fullScreenUser !== null) {
      const fullScreenUserState = Array.from(remoteUsers.values()).find(
        (user) => user.uid === fullScreenUser
      );

      if (
        fullScreenUserState &&
        fullScreenUserState.hasVideo &&
        fullScreenUserState.user.videoTrack &&
        fullScreenVideoRef.current
      ) {
        try {
          // Stop playing in grid view before playing in full screen
          const gridVideoRef = remoteVideoRefs.current.get(
            fullScreenUserState.uid
          );
          if (gridVideoRef && fullScreenUserState.user.videoTrack.isPlaying) {
            (fullScreenUserState.user.videoTrack as IRemoteVideoTrack).stop();
          }

          // Play in full screen with proper fit
          (fullScreenUserState.user.videoTrack as IRemoteVideoTrack).play(
            fullScreenVideoRef.current,
            {
              fit: "contain",
            }
          );
          log("Playing full screen video for user:", fullScreenUser);
        } catch (err) {
          console.error("Error playing full screen video:", err);
        }
      }
    } else {
      // When exiting full screen, ensure videos play in grid view
      remoteUsers.forEach((state) => {
        if (state.hasVideo && state.user.videoTrack) {
          const videoRef = remoteVideoRefs.current.get(state.uid);
          if (videoRef) {
            const remoteVideo = state.user.videoTrack as IRemoteVideoTrack;
            if (!remoteVideo.isPlaying) {
              try {
                remoteVideo.play(videoRef, {
                  fit: "cover",
                });
              } catch (err) {
                console.error("Error restoring video to grid:", err);
              }
            }
          }
        }
      });
    }
  }, [fullScreenUser, remoteUsers, log]);

  // --- Update floating preview when video track changes
  useEffect(() => {
    if (isJoined && floatingPreviewRef.current) {
      const currentTrack = isScreenSharing
        ? screenTrackRef.current
        : localVideoTrackRef.current;

      if (currentTrack && floatingPreviewRef.current) {
        try {
          // Stop any existing playback
          if (currentTrack.isPlaying) {
            currentTrack.stop();
          }

          // Play the current track
          currentTrack.play(floatingPreviewRef.current, {
            fit: "cover",
          });

          log(
            "Updated floating preview with",
            isScreenSharing ? "screen track" : "camera track"
          );
        } catch (err) {
          console.error("Error updating floating preview:", err);
        }
      }
    }
  }, [isJoined, isScreenSharing, log]);

  // --- Join meeting: reuse prejoin tracks if available
  const joinMeeting = async () => {
    setIsJoining(true);
    setError(null);
    const client = clientRef.current;
    if (!client) {
      setError("RTC client not ready");
      setIsJoining(false);
      return;
    }

    try {
      const userId = usersId || Math.random().toString(36).substring(2, 15);
      const role = "publisher";
      log("Requesting token for channel:", channelName, "userId:", userId);
      const response = await generateToken({
        channelName,
        userId,
        role,
      }).unwrap();
      if (!response.success || !response.data) {
        throw new Error(response.message || "Token generation failed");
      }
      const cfg = {
        appId: response.data.appId,
        token: response.data.token,
        channel: response.data.channelName,
        uid: response.data.uid,
      };
      log("Joining channel:", cfg.channel, "uid:", cfg.uid);

      // join
      await client.join(cfg.appId, cfg.channel, cfg.token, cfg.uid);
      log("Successfully joined channel:", cfg.channel);

      // Publish local tracks: reuse existing prejoin tracks to avoid flicker
      const publishTracks: Array<ILocalAudioTrack | ILocalVideoTrack> = [];

      // Ensure audio track exists and is enabled
      if (!localAudioTrackRef.current) {
        const mic = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = mic;
      }
      await localAudioTrackRef.current!.setEnabled(isMicOn);
      publishTracks.push(localAudioTrackRef.current!);

      // Ensure video track exists and is enabled
      if (!localVideoTrackRef.current) {
        const cam = await AgoraRTC.createCameraVideoTrack({
          encoderConfig: { width: 640, height: 480, frameRate: 30 },
        });
        localVideoTrackRef.current = cam;
      }
      await localVideoTrackRef.current!.setEnabled(isVideoOn);
      publishTracks.push(localVideoTrackRef.current!);

      // Move playback from prejoin element to floating preview
      if (localVideoTrackRef.current && floatingPreviewRef.current) {
        try {
          // Stop previous playback and play in floating preview
          if (localVideoTrackRef.current.isPlaying) {
            localVideoTrackRef.current.stop();
          }
          localVideoTrackRef.current.play(floatingPreviewRef.current, {
            fit: "cover",
          });
          log("Local video now playing in floating preview");
        } catch (err) {
          console.warn(
            "Could not play local video in floating preview immediately",
            err
          );
        }
      }

      await client.publish(publishTracks);
      log("Published local audio & video tracks");

      setIsJoined(true);
      setShowShareModal(true);
    } catch (err: unknown) {
      console.error("Error joining meeting:", err);
      let msg = "Failed to join meeting. Please try again.";
      if (err instanceof Error) {
        const message = err.message;
        if (message.includes("PERMISSION_DENIED")) {
          msg = "Camera/microphone permission denied.";
        } else if (
          message.includes("NotFoundError") ||
          message.includes("NOT_FOUND")
        ) {
          msg = "Camera or microphone not found.";
        } else {
          msg = message;
        }
      }
      setError(msg);
    } finally {
      setIsJoining(false);
    }
  };

  // --- Toggle mic (works both pre-join and joined)
  const toggleMic = async () => {
    try {
      const audio = localAudioTrackRef.current;
      if (!audio) {
        // try create
        const mic = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = mic;
        await mic.setEnabled(true);
        setIsMicOn(true);

        // If joined, publish the new track
        if (isJoined && clientRef.current) {
          await clientRef.current.publish([mic]);
        }
        return;
      }
      const newState = !isMicOn;
      await audio.setEnabled(newState);
      setIsMicOn(newState);
      log("Toggled mic. Now isMicOn:", newState);
    } catch (err) {
      console.error("Error toggling mic:", err);
      setError("Cannot toggle microphone.");
      setTimeout(() => setError(null), 3000);
    }
  };

  // --- Toggle video (works pre-join too)
  const toggleVideo = async () => {
    try {
      const video = localVideoTrackRef.current;
      const newState = !isVideoOn;

      if (!video) {
        const cam = await AgoraRTC.createCameraVideoTrack({
          encoderConfig: { width: 640, height: 480, frameRate: 30 },
        });
        localVideoTrackRef.current = cam;

        if (prejoinLocalRef.current) {
          cam.play(prejoinLocalRef.current, {
            fit: "cover",
          });
        }

        await cam.setEnabled(true);
        setIsVideoOn(true);

        // If joined, publish the new track and update floating preview
        if (isJoined && clientRef.current) {
          await clientRef.current.publish([cam]);

          if (floatingPreviewRef.current) {
            cam.play(floatingPreviewRef.current, {
              fit: "cover",
            });
          }
        }
        return;
      }

      await video.setEnabled(newState);
      setIsVideoOn(newState);
      log("Toggled video. Now isVideoOn:", newState);
    } catch (err) {
      console.error("Error toggling video:", err);
      setError("Cannot toggle camera.");
      setTimeout(() => setError(null), 3000);
    }
  };

  // --- Screen sharing (sharer sees own screen; viewers see full aspect)
  const toggleScreenShare = async () => {
    const client = clientRef.current;
    if (!client) return;

    try {
      if (!isScreenSharing) {
        log("Starting screen share: creating screen track");
        const screenTrack = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: "1080p_1",
        });
        screenTrackRef.current = screenTrack as ILocalVideoTrack;

        // Unpublish camera track and publish screen track
        if (localVideoTrackRef.current) {
          try {
            await client.unpublish([localVideoTrackRef.current]);
            log("Unpublished camera track to publish screen only");
          } catch (e) {
            console.warn(
              "Could not unpublish camera before publishing screen",
              e
            );
          }
        }

        await client.publish([screenTrack as ILocalVideoTrack]);
        log("Published screen track to channel");

        // Play screen share preview in floating window for the sharer
        if (floatingPreviewRef.current && screenTrackRef.current) {
          try {
            screenTrackRef.current.play(floatingPreviewRef.current, {
              fit: "contain",
            });
            log("Screen track playing in floating preview for presenter");
          } catch (e) {
            console.warn("Could not play screen in floating preview", e);
          }
        }

        (screenTrack as ILocalVideoTrack).on("track-ended", async () => {
          log("Screen share track ended (native event)");
          await stopScreenShare();
        });

        setIsScreenSharing(true);
      } else {
        await stopScreenShare();
      }
    } catch (err: unknown) {
      console.error("Screen share error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(
        errorMessage.includes("PERMISSION_DENIED")
          ? "Screen sharing permission denied. Please allow permissions."
          : "Failed to share screen. Please allow screen-sharing permissions."
      );
      setTimeout(() => setError(null), 3000);
    }
  };

  const stopScreenShare = async () => {
    const client = clientRef.current;
    const screenTrack = screenTrackRef.current;
    if (!client) return;

    try {
      // Unpublish screen track if exists
      if (screenTrack) {
        await client.unpublish([screenTrack]);
        screenTrack.close();
        screenTrackRef.current = null;
        log("Stopped and unpublished screen track");
      }

      // Publish camera track again if we have one
      if (localVideoTrackRef.current) {
        try {
          await client.publish([localVideoTrackRef.current]);
          log("Re-published camera track after stopping screen");
        } catch (publishErr) {
          console.error("Error publishing camera track:", publishErr);
        }

        // Update floating preview to show camera
        if (floatingPreviewRef.current) {
          try {
            if (localVideoTrackRef.current.isPlaying) {
              localVideoTrackRef.current.stop();
            }
            localVideoTrackRef.current.play(floatingPreviewRef.current, {
              fit: "cover",
            });
            log("Updated floating preview to show camera");
          } catch (playErr) {
            console.warn("Could not play camera in floating preview:", playErr);
          }
        }
      }

      setIsScreenSharing(false);
    } catch (err) {
      console.error("Error stopping screen share:", err);
      setError("Error stopping screen share. Please try again.");
      setTimeout(() => setError(null), 3000);
    }
  };

  // --- Leave meeting
  const leaveCall = async () => {
    isLeavingRef.current = true;
    const client = clientRef.current;
    try {
      if (isScreenSharing && screenTrackRef.current) {
        await stopScreenShare();
      }
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
      }
      if (client && client.connectionState !== "DISCONNECTED") {
        await client.leave();
        log("Left channel");
      }
    } catch (err) {
      console.error("Error leaving call:", err);
    } finally {
      router.push("/meet");
    }
  };

  // --- copy link
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  // --- Toggle full screen for a user
  const toggleFullScreen = (uid: number | null) => {
    setFullScreenUser((prev) => (prev === uid ? null : uid));
  };

  // --- Check if there's any screen share from remote users
  const hasRemoteScreenShare = Array.from(remoteUsers.values()).some(
    (user) => user.isScreen
  );

  // Register video ref for a remote user
  const registerVideoRef = (uid: number, element: HTMLDivElement | null) => {
    if (element) {
      remoteVideoRefs.current.set(uid, element);
      // If user already has a videoTrack, play immediately
      const state = remoteUsers.get(uid);
      if (state && state.hasVideo && state.user.videoTrack) {
        const remoteVideo = state.user.videoTrack as IRemoteVideoTrack;
        if (!remoteVideo.isPlaying) {
          try {
            remoteVideo.play(element, {
              fit: "cover",
            });
            log("Playing remote video into newly registered element for", uid);
          } catch (err) {
            console.warn(
              "Error playing remote video after registering ref",
              err
            );
          }
        }
      }
    } else {
      remoteVideoRefs.current.delete(uid);
    }
  };

  // --- Get the main content to display (either full screen user or regular grid)
  const getMainContent = () => {
    if (fullScreenUser !== null) {
      const fullScreenUserState = Array.from(remoteUsers.values()).find(
        (user) => user.uid === fullScreenUser
      );

      return (
        <div className="flex-1 bg-black relative h-screen w-full">
          <div className="w-full h-full flex items-center justify-center bg-black">
            {fullScreenUserState && fullScreenUserState.hasVideo ? (
              <div
                ref={fullScreenVideoRef}
                className="w-full h-full flex items-center justify-center"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-white">
                <div className="w-32 h-32 rounded-full bg-slate-700 flex items-center justify-center mb-4">
                  <span className="text-white font-semibold text-xl">
                    {fullScreenUserState
                      ? String(fullScreenUserState.uid)
                          .slice(0, 2)
                          .toUpperCase()
                      : "??"}
                  </span>
                </div>
                <p className="text-lg">Participant {fullScreenUser}</p>
                <p className="text-slate-400 mt-2">Video is not available</p>
              </div>
            )}
          </div>

          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={() => toggleFullScreen(fullScreenUser)}
              className="p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              title="Exit full screen"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {fullScreenUserState && (
            <>
              <div className="absolute bottom-4 left-4 bg-black/50 text-white px-4 py-2 rounded-full">
                <div className="text-sm font-medium">
                  Participant {fullScreenUserState.uid}
                  {fullScreenUserState.isScreen && (
                    <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                      Screen Sharing
                    </span>
                  )}
                </div>
              </div>

              {!fullScreenUserState.hasAudio && (
                <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full">
                  <MicOff className="w-4 h-4" />
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    return (
      <div className="flex-1 p-4 overflow-auto h-full bg-slate-50">
        {remoteUsers.size === 0 ? (
          <div className="w-full h-full flex items-center justify-center bg-white rounded-lg min-h-[60vh]">
            <div className="text-center">
              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-600 mb-2">
                Waiting for participants to join
              </h3>
              <p className="text-slate-500">
                Share the meeting link to invite others
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-4 w-full h-full ${
              remoteUsers.size === 1
                ? "grid-cols-1"
                : remoteUsers.size === 2
                ? "grid-cols-1 md:grid-cols-2"
                : remoteUsers.size <= 4
                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            }`}
          >
            {Array.from(remoteUsers.values()).map((s) => (
              <div
                key={s.uid}
                className="relative bg-white border rounded-lg overflow-hidden min-h-[200px] md:min-h-[300px] shadow-sm"
              >
                <div
                  ref={(el) => registerVideoRef(s.uid, el)}
                  className="w-full h-full bg-slate-50 remote-video-container"
                />
                {!s.hasVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-200 flex items-center justify-center">
                      <span className="text-slate-600 font-semibold text-sm md:text-base">
                        {String(s.uid).slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full shadow-sm flex items-center gap-2">
                  <div className="text-sm font-medium">Participant {s.uid}</div>
                  {s.isScreen && (
                    <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                      Screen
                    </span>
                  )}
                </div>
                {!s.hasAudio && (
                  <div className="absolute top-3 right-12 bg-red-600 text-white p-2 rounded-full">
                    <MicOff className="w-3 h-3" />
                  </div>
                )}
                <button
                  onClick={() => toggleFullScreen(s.uid)}
                  className="absolute top-3 right-3 bg-black/70 text-white p-2 rounded-full hover:bg-black/90 transition-colors"
                  title="Maximize"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // floating preview drag handlers
  const onFloatMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX - floatPos.current.x,
      startY: e.clientY - floatPos.current.y,
    };

    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current || !dragStateRef.current.dragging) return;
      floatPos.current.x = e.clientX - dragStateRef.current.startX;
      floatPos.current.y = e.clientY - dragStateRef.current.startY;
      if (floatRef.current) {
        floatRef.current.style.transform = `translate(${floatPos.current.x}px, ${floatPos.current.y}px)`;
      }
    };

    const handleMouseUp = () => {
      if (dragStateRef.current) dragStateRef.current.dragging = false;
    };

    // Cast to EventListener to avoid TypeScript errors
    const moveHandler = handleMouseMove as unknown as EventListener;
    window.addEventListener("mousemove", moveHandler);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (isLoading) return <PageLoading />;
  if (isError) return <div>something went wrong</div>;

  // --- UI: Pre-join view
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                Ready to join
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Meeting ID:{" "}
                <span className="font-mono text-slate-700">{channelName}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-700 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative border">
                <div ref={prejoinLocalRef} className="w-full h-full" />
                {!isVideoOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                    <div className="w-24 h-24 bg-slate-300 rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-slate-600 font-semibold text-lg">
                        You
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMic}
                  className={`p-4 rounded-full border-2 transition-all ${
                    isMicOn
                      ? "bg-white border-slate-200 hover:border-slate-300"
                      : "bg-red-50 border-red-200 hover:border-red-300"
                  }`}
                  title={isMicOn ? "Mute" : "Unmute"}
                >
                  {isMicOn ? (
                    <Mic className="w-6 h-6 text-slate-700" />
                  ) : (
                    <MicOff className="w-6 h-6 text-red-600" />
                  )}
                </button>

                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full border-2 transition-all ${
                    isVideoOn
                      ? "bg-white border-slate-200 hover:border-slate-300"
                      : "bg-red-50 border-red-200 hover:border-red-300"
                  }`}
                  title={isVideoOn ? "Stop Video" : "Start Video"}
                >
                  {isVideoOn ? (
                    <Video className="w-6 h-6 text-slate-700" />
                  ) : (
                    <VideoOff className="w-6 h-6 text-red-600" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-lg font-medium text-slate-800">
                  Meeting Details
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Participants:</span>
                    <span className="font-medium text-slate-800">
                      {remoteUsers.size + (isJoined ? 1 : 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Video:</span>
                    <span
                      className={`font-medium ${
                        isVideoOn ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {isVideoOn ? "On" : "Off"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Microphone:</span>
                    <span
                      className={`font-medium ${
                        isMicOn ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {isMicOn ? "On" : "Off"}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-500 pt-2 border-t border-slate-200">
                  Check your camera and microphone settings before joining the
                  meeting.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/meet")}
                  className="flex-1 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                  disabled={isJoining || isGenerating}
                >
                  Cancel
                </button>
                <button
                  onClick={joinMeeting}
                  className="flex-1 py-3 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                  disabled={isJoining || isGenerating}
                >
                  {isJoining || isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Meeting"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-slate-800 text-lg">
                  Share Meeting Link
                </h4>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-slate-500 hover:text-slate-700 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="mb-4">
                <input
                  readOnly
                  value={meetingLink}
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyLink}
                  className="flex-1 py-3 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-medium"
                >
                  {copied ? (
                    <>
                      <Check className="w-5 h-5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      Copy Link
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="py-3 px-6 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Meeting UI when joined
  return (
    <>
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-800 text-lg">
                Share Meeting Link
              </h4>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="mb-4">
              <input
                readOnly
                value={meetingLink}
                className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={copyLink}
                className="flex-1 py-3 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy Link
                  </>
                )}
              </button>
              <button
                onClick={() => setShowShareModal(false)}
                className="py-3 px-6 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-slate-50 flex flex-col h-screen">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <Users className="w-5 h-5 text-slate-600" />
            <div className="text-slate-800 font-medium">
              {remoteUsers.size + 1} participant
              {remoteUsers.size !== 0 ? "s" : ""}
            </div>
            {hasRemoteScreenShare && (
              <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                Screen sharing
              </span>
            )}
            {fullScreenUser && (
              <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                Full screen
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowShareModal(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-700 transition-colors font-medium"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button
              onClick={leaveCall}
              title="Leave meeting"
              className="p-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">{getMainContent()}</div>

        {fullScreenUser === null && (
          <div
            ref={floatRef}
            onMouseDown={onFloatMouseDown}
            style={{
              position: "fixed",
              bottom: 16,
              left: 16,
              transform: `translate(${floatPos.current.x}px, ${floatPos.current.y}px)`,
              zIndex: 50,
            }}
            className="w-40 h-28 md:w-56 md:h-36 bg-white border-2 border-blue-500 rounded-xl shadow-xl cursor-grab overflow-hidden hover:border-blue-600 transition-colors"
          >
            <div className="w-full h-full relative">
              <div
                ref={floatingPreviewRef}
                className="w-full h-full bg-slate-100"
                style={{ pointerEvents: "none" }}
              />
              {!isVideoOn && !isScreenSharing && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-300 rounded-full flex items-center justify-center shadow-sm">
                    <span className="text-slate-600 text-xs font-semibold">
                      You
                    </span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/80 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                You {isScreenSharing ? "(Presenting)" : ""}
              </div>
              {isScreenSharing && (
                <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium">
                  <MonitorUp className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border-t p-4 flex-shrink-0 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={toggleMic}
              className={`p-4 rounded-full border-2 transition-all ${
                isMicOn
                  ? "bg-white border-slate-300 hover:border-slate-400"
                  : "bg-red-50 border-red-300 hover:border-red-400"
              }`}
              title={isMicOn ? "Mute" : "Unmute"}
            >
              {isMicOn ? (
                <Mic className="w-6 h-6 text-slate-700" />
              ) : (
                <MicOff className="w-6 h-6 text-red-600" />
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full border-2 transition-all ${
                isVideoOn
                  ? "bg-white border-slate-300 hover:border-slate-400"
                  : "bg-red-50 border-red-300 hover:border-red-400"
              }`}
              title={isVideoOn ? "Stop Video" : "Start Video"}
            >
              {isVideoOn ? (
                <Video className="w-6 h-6 text-slate-700" />
              ) : (
                <VideoOff className="w-6 h-6 text-red-600" />
              )}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-4 rounded-full border-2 transition-all ${
                isScreenSharing
                  ? "bg-blue-50 border-blue-500 hover:border-blue-600"
                  : "bg-white border-slate-300 hover:border-slate-400"
              }`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
            >
              <MonitorUp
                className={`w-6 h-6 ${
                  isScreenSharing ? "text-blue-600" : "text-slate-700"
                }`}
              />
            </button>

            <button
              onClick={leaveCall}
              className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors ml-2"
              title="Leave"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
