(function initializeStudyReward(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.StudyReward = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStudyReward() {
  const TARGET_SECONDS = 16 * 60 * 60;
  const TARGET_HOURS = 16;
  const MAX_REWARD_RUPEES = 50;

  function calculateVerifiedStudySeconds(sessions, submissions) {
    const verifiedDates = new Set(
      submissions.filter((submission) => submission.category === "study").map((submission) => submission.date)
    );
    return sessions.reduce((total, session) => {
      const date = new Date(session.date);
      const sessionDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return verifiedDates.has(sessionDate) ? total + (session.creditedSeconds || 0) : total;
    }, 0);
  }

  function isUnlocked(verifiedSeconds) {
    return verifiedSeconds >= TARGET_SECONDS;
  }

  function calculateProgress(verifiedSeconds) {
    return Math.min(100, (verifiedSeconds / TARGET_SECONDS) * 100);
  }

  function calculateCompletedHours(verifiedSeconds) {
    return Math.min(TARGET_HOURS, Math.floor(verifiedSeconds / 3600));
  }

  function calculateRewardAmount(verifiedSeconds) {
    const completedHours = calculateCompletedHours(verifiedSeconds);
    return Math.round((completedHours / TARGET_HOURS) * MAX_REWARD_RUPEES);
  }

  function getHourlyRewardSchedule() {
    return Array.from({ length: TARGET_HOURS }, (_, index) => {
      const hour = index + 1;
      return {
        hour,
        amount: Math.round((hour / TARGET_HOURS) * MAX_REWARD_RUPEES)
      };
    });
  }

  return {
    TARGET_SECONDS,
    TARGET_HOURS,
    MAX_REWARD_RUPEES,
    calculateVerifiedStudySeconds,
    isUnlocked,
    calculateProgress,
    calculateCompletedHours,
    calculateRewardAmount,
    getHourlyRewardSchedule
  };
});
