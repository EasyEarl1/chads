// ClickTut - Tutorial Model
// Data structure for tutorials (currently in-memory, can be replaced with database)

class Tutorial {
  constructor(data) {
    this._id = data._id || `tut_${Date.now()}`;
    this.title = data.title || 'Untitled Tutorial';
    this.description = data.description || '';
    this.status = data.status || 'recording'; // recording, recording_complete, processing, completed, failed
    this.steps = data.steps || [];
    this.generatedScript = data.generatedScript || null;
    this.audioUrl = data.audioUrl || null;
    this.videoUrl = data.videoUrl || null;
    this.createdAt = data.createdAt || new Date();
    this.completedAt = data.completedAt || null;
    this.metadata = data.metadata || {
      totalDuration: 0,
      clickCount: 0
    };
  }

  // Add a step
  addStep(step) {
    this.steps.push(step);
    this.metadata.clickCount = this.steps.length;
  }

  // Get step by number
  getStep(stepNumber) {
    return this.steps.find(s => s.stepNumber === stepNumber);
  }

  // Update status
  updateStatus(status) {
    this.status = status;
    if (status === 'recording_complete' || status === 'completed') {
      this.completedAt = new Date();
      if (this.createdAt) {
        this.metadata.totalDuration = this.completedAt - this.createdAt;
      }
    }
  }

  // Convert to JSON
  toJSON() {
    return {
      _id: this._id,
      title: this.title,
      description: this.description,
      status: this.status,
      steps: this.steps,
      generatedScript: this.generatedScript,
      audioUrl: this.audioUrl,
      videoUrl: this.videoUrl,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      metadata: this.metadata
    };
  }
}

module.exports = Tutorial;

