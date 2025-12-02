

// src/app/meeting/page.tsx
"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Loader2, Link as LinkIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function MeetingLandingPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generateRandomChannelName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const getPart = (length: number) =>
    Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

  return `${getPart(4)}-${getPart(5)}-${getPart(3)}`;
}
  const createMeeting = () => {
    setIsCreating(true);
    setError(null);
    try {
      const channelName = generateRandomChannelName();
      console.log("Creating meeting channel:", channelName);
      router.push(`/meet/${channelName}`);
    } catch (err: unknown) {
      console.error("Create meeting error:", err);
      setError("Failed to create meeting. Please try again.");
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-10">
          <Link href={'/'} className="inline-flex items-center justify-center w-25 h-25 bg-blue-200/20  rounded-full mb-6 shadow drop-shadow-black">
            {/* <Video className="w-10 h-10 text-white" /> */}

          <Image
            src="/logo-without-name.png"
            alt="Logo"
            className="p-2"
            width={100}
            height={100}

          />
          </Link>
          {/* <h1 className="text-4xl font-semibold text-slate-800 mb-2">
            Video Meetings
          </h1> */}
          {/* <p className="text-slate-600">Lightweight, reliable meetings — built with Agora.</p> */}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* <div className="bg-white border shadow-sm rounded-xl p-8 max-w-md mx-auto"> */}
        <div className="max-w-md mx-auto">
          <button
            onClick={createMeeting}
            disabled={isCreating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Meeting...
              </>
            ) : (
              <>
                <Video className="w-5 h-5" />
                Start New Meeting
              </>
            )}
          </button>

          <div className="mt-6 pt-6 border-slate-100 text-center text-sm text-slate-500">
            {/* <div className="inline-flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-slate-400" />
              <span>Share the meeting link to invite others</span>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
}
