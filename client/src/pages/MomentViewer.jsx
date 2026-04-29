import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Share2,
  Download,
  Bookmark,
  Heart,
  MessageCircle,
  ChevronLeft,
  Instagram,
  Twitter,
  Facebook,
  Whatsapp
} from 'lucide-react';

export const MomentViewer = () => {
  const { momentId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [moment, setMoment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    loadMoment();
  }, [momentId]);

  const loadMoment = async () => {
    try {
      const response = await fetch(`/api/moments/${momentId}`);
      const data = await response.json();
      
      if (data.success) {
        setMoment(data.data);
        setDuration(data.data.capturedVideo?.duration || 0);
      }
    } catch (error) {
      console.error('Load moment error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleShare = async (platform) => {
    if (!moment?.shareUrls) return;
    
    const url = moment.shareUrls[platform] || moment.shareUrls.direct;
    
    if (platform === 'direct') {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    } else {
      window.open(url, '_blank');
    }
    
    // Increment share count
    await fetch(`/api/moments/${momentId}/share`, { method: 'POST' });
  };

  const handleSave = async () => {
    await fetch(`/api/moments/${momentId}/save`, { method: 'POST' });
    setSaved(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading moment...</p>
        </div>
      </div>
    );
  }

  if (!moment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Moment Not Found</h2>
          <p className="text-gray-400 mb-4">This moment may have expired or been deleted.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        
        <h1 className="text-lg font-semibold text-white">Moment</h1>
        
        <div className="w-20" /> {/* Spacer */}
      </div>

      {/* Video Player */}
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={moment.capturedVideo?.url}
          className="w-full max-h-[60vh] object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setPlaying(false)}
        />
        
        {/* Video Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Timeline */}
          <div 
            className="w-full h-1 bg-gray-600 rounded-full mb-4 cursor-pointer"
            onClick={handleSeek}
          >
            <div 
              className="h-full bg-primary rounded-full"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={handlePlayPause}>
                {playing ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white" />
                )}
              </button>
              
              <button onClick={() => setMuted(!muted)}>
                {muted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
              
              <span className="text-sm text-white">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLiked(!liked)}
                className={liked ? 'text-red-500' : 'text-white'}
              >
                <Heart className="w-5 h-5" fill={liked ? 'currentColor' : 'none'} />
              </button>
              
              <button
                onClick={handleSave}
                className={saved ? 'text-yellow-500' : 'text-white'}
              >
                <Bookmark className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} />
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="text-white"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                
                {showShareMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl p-2 min-w-[200px]">
                    <button
                      onClick={() => handleShare('instagram')}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg text-white"
                    >
                      <Instagram className="w-4 h-4 text-pink-500" />
                      <span>Instagram Story</span>
                    </button>
                    <button
                      onClick={() => handleShare('whatsapp')}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg text-white"
                    >
                      <Whatsapp className="w-4 h-4 text-green-500" />
                      <span>WhatsApp</span>
                    </button>
                    <button
                      onClick={() => handleShare('twitter')}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg text-white"
                    >
                      <Twitter className="w-4 h-4 text-blue-400" />
                      <span>Twitter</span>
                    </button>
                    <button
                      onClick={() => handleShare('facebook')}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg text-white"
                    >
                      <Facebook className="w-4 h-4 text-blue-600" />
                      <span>Facebook</span>
                    </button>
                    <div className="border-t border-gray-700 my-2" />
                    <button
                      onClick={() => handleShare('direct')}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg text-white"
                    >
                      <span>Copy Link</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Moment Info */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">
            {moment.type === 'reaction_spike' ? '🔥' :
             moment.type === 'comment_cluster' ? '💬' :
             moment.type === 'bookmark' ? '⭐' : '🎬'}
          </span>
          <div>
            <h2 className="text-xl font-bold text-white">
              {moment.type === 'reaction_spike' ? 'Reaction Spike' :
               moment.type === 'comment_cluster' ? 'Hot Discussion' :
               moment.type === 'bookmark' ? 'Bookmarked Moment' : 'Highlight'}
            </h2>
            <p className="text-gray-400">
              {new Date(moment.createdAt).toLocaleDateString()} • {
                moment.stats?.viewCount || 0
              } views
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {moment.stats?.reactionCount || 0}
            </div>
            <div className="text-xs text-gray-400">Reactions</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-500">
              {moment.stats?.uniqueReactors || 0}
            </div>
            <div className="text-xs text-gray-400">Reactors</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-500">
              {(moment.intensity * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-400">Intensity</div>
          </div>
        </div>

        {/* Reactions */}
        {moment.reactions?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Reactions</h3>
            <div className="flex flex-wrap gap-2">
              {moment.reactions.slice(0, 10).map((reaction, i) => (
                <div
                  key={i}
                  className="bg-gray-800 rounded-full px-3 py-1 flex items-center gap-1"
                >
                  <span>{reaction.reaction}</span>
                  <span className="text-xs text-gray-400">{reaction.username}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        {moment.comments?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Comments</h3>
            <div className="space-y-2">
              {moment.comments.slice(0, 5).map((comment, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">
                      {comment.username}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(comment.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{comment.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};