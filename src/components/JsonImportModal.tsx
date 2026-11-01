import React, { useState } from 'react';
import { CityNetworkData } from '../types/simulation';
import { validateAndSanitizeNetworkJson } from '../engine/validator';
import { X, Upload, CheckCircle2, AlertTriangle, FileWarning } from 'lucide-react';

interface JsonImportModalProps {
  isOpen: boolean;
  currentNetwork: CityNetworkData;
  onClose: () => void;
  onImportValidNetwork: (net: CityNetworkData, warnings: string[]) => void;
}

export const JsonImportModal: React.FC<JsonImportModalProps> = ({
  isOpen,
  currentNetwork,
  onClose,
  onImportValidNetwork,
}) => {
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(currentNetwork, null, 2)
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleValidateAndApply = (rawString: string) => {
    setErrors([]);
    setWarnings([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawString);
    } catch (err) {
      setErrors([
        `JSON 구문 파싱 오류: ${err instanceof Error ? err.message : '유효하지 않은 JSON 문자열입니다.'}`,
      ]);
      return;
    }

    const res = validateAndSanitizeNetworkJson(parsed);
    if (!res.valid || !res.sanitizedData) {
      setErrors(res.errors);
      setWarnings(res.warnings);
      return;
    }

    onImportValidNetwork(res.sanitizedData, res.warnings);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setJsonText(content);
      handleValidateAndApply(content);
    };
    reader.readAsText(file);
  };

  const loadBrokenSampleForTest = () => {
    const broken = JSON.stringify(
      {
        version: '1.0.0',
        id: 'broken_sample',
        name: '참조 무결성 오류 샘플',
        nodes: [
          { id: 'N1', name: '교차로1', x: 100, y: 100 },
          { id: 'N2', name: '교차로2', x: 300, y: 100 },
        ],
        edges: [
          { id: 'E_BAD', from: 'N1', to: 'GHOST_NODE_99', lanes: 2, speedLimitKmh: 50 },
        ],
        demands: [{ id: 'OD_BAD', origin: 'N1', destination: 'MISSING_DEST', vehiclesPerHour: 800 }],
      },
      null,
      2
    );
    setJsonText(broken);
    handleValidateAndApply(broken);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Upload size={16} className="icon-cyan" />
            <h3>도시 설정 JSON 가져오기 및 스키마·무결성 검증</h3>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-toolbar">
            <label className="secondary-action-btn file-label">
              <Upload size={14} /> .json 파일 선택
              <input type="file" accept=".json,application/json" onChange={handleFileUpload} hidden />
            </label>
            <button
              type="button"
              className="secondary-action-btn"
              onClick={() => {
                setJsonText(JSON.stringify(currentNetwork, null, 2));
                setErrors([]);
                setWarnings([]);
              }}
            >
              현재 도시 JSON 불러오기
            </button>
            <button
              type="button"
              className="secondary-action-btn"
              onClick={loadBrokenSampleForTest}
            >
              <FileWarning size={14} /> 오류 JSON 검증 테스트
            </button>
          </div>

          <textarea
            className="json-textarea"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            spellCheck={false}
          />

          {errors.length > 0 && (
            <div className="validation-error-box">
              <div className="err-title">
                <AlertTriangle size={15} /> 스키마 및 참조 무결성 검증 실패 ({errors.length}건)
              </div>
              <ul>
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="validation-warn-box">
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-action-btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="primary-neon-btn"
            onClick={() => handleValidateAndApply(jsonText)}
          >
            <CheckCircle2 size={15} /> 검증 및 도시 적용
          </button>
        </div>
      </div>
    </div>
  );
};
