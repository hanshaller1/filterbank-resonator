export const ANALYZER_SOURCE_LABELS = Object.freeze({
  input: 'Input', postFreeze: 'Post Freeze', postGate: 'Post Gate', postTransient: 'Post Transient',
  postDrive: 'Post Drive', postWavefolder: 'Post Wavefolder', postCrusher: 'Post Crusher',
  postFilter: 'Post Filter', postEq: 'Post EQ', postCompressor: 'Post Compressor',
  postWidth: 'Post Width', postClipper: 'Post Clipper', postMix: 'Post Mix', output: 'Output'
});
export const ANALYZER_SOURCE_NAMES = Object.freeze(Object.keys(ANALYZER_SOURCE_LABELS));
export const ANALYZER_DEFAULT_SOURCES = Object.freeze(['input', 'postFreeze', 'postDrive', 'postFilter', 'postEq', 'output']);
