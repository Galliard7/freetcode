-- Migration: add time/space breakdown columns to the arcade leaderboard.
-- Safe + additive (existing rows get NULLs). Run once on the remote D1.
ALTER TABLE leaderboard ADD COLUMN t_ratio REAL;
ALTER TABLE leaderboard ADD COLUMN s_ratio REAL;
