import React from 'react';
import {createRoot} from 'react-dom/client';
import {FaceLivenessDetectorCore} from '@aws-amplify/ui-react-liveness';
import '@aws-amplify/ui-react/styles.css';

const displayText={
  cameraMinSpecificationsHeadingText:'Cámara no disponible',
  cameraMinSpecificationsMessageText:'Usa una cámara frontal y permite su acceso en tu navegador.',
  cameraNotFoundHeadingText:'No encontramos una cámara',
  cameraNotFoundMessageText:'Conecta o activa la cámara frontal.',
  retryCameraPermissionsText:'Permitir cámara',
  waitingCameraPermissionText:'Esperando permiso para la cámara…',
  goodFitCaptionText:'Mantén la posición',
  goodFitAltText:'Ejemplo de rostro centrado frente a la cámara',
  tooFarCaptionText:'Acércate un poco',
  tooFarAltText:'Ejemplo de rostro demasiado lejos de la cámara',
  a11yVideoLabelText:'Video de tu prueba de presencia',
  photosensitivityWarningHeadingText:'Aviso sobre luces intermitentes',
  photosensitivityWarningBodyText:'La prueba puede mostrar luces de colores. Si eres sensible a luces intermitentes, no la inicies y contacta a atención al cliente.',
  photosensitivityWarningInfoText:'Busca buena luz y mantén tu rostro visible.',
  photosensitivityWarningLabelText:'Advertencia de fotosensibilidad',
  cancelLivenessCheckText:'Cancelar prueba',
  startScreenBeginCheckText:'Comenzar',
  hintCenterFaceText:'Centra tu rostro',
  hintCenterFaceInstructionText:'Coloca tu rostro en el centro',
  hintFaceOffCenterText:'Centra tu rostro frente a la cámara',
  hintMoveFaceFrontOfCameraText:'Colócate frente a la cámara',
  hintTooManyFacesText:'Debe aparecer una sola persona',
  hintTooCloseText:'Aléjate un poco',
  hintTooFarText:'Acércate un poco',
  hintFaceDetectedText:'Rostro detectado',
  hintCanNotIdentifyText:'No podemos detectar tu rostro. Busca buena luz.',
  hintConnectingText:'Conectando…',
  hintCheckCompleteText:'Prueba completada',
  hintIlluminationTooBrightText:'Hay demasiada luz',
  hintIlluminationTooDarkText:'Busca un lugar con más luz',
  hintIlluminationNormalText:'La luz es adecuada',
  hintHoldFaceForFreshnessText:'Mantén la posición',
  hintMatchIndicatorText:'Acerca tu rostro al óvalo',
  hintVerifyingText:'Comprobando…',
  errorLabelText:'No se completó la prueba',
  connectionTimeoutHeaderText:'Se perdió la conexión',
  connectionTimeoutMessageText:'Revisa tu conexión antes de reintentar.',
  timeoutHeaderText:'La prueba venció',
  timeoutMessageText:'Vuelve a la pantalla anterior para consultar o iniciar otra prueba.',
  faceDistanceHeaderText:'Ajusta tu posición',
  faceDistanceMessageText:'Sigue las indicaciones de distancia de la cámara.',
  multipleFacesHeaderText:'Debe aparecer una sola persona',
  multipleFacesMessageText:'Realiza la prueba sin otras personas frente a la cámara.',
  clientHeaderText:'No pudimos completar la prueba',
  clientMessageText:'Comprueba la cámara y tu conexión.',
  serverHeaderText:'La prueba no está disponible',
  serverMessageText:'Vuelve a la pantalla anterior e intenta de nuevo más tarde.',
  landscapeHeaderText:'Gira tu teléfono',
  landscapeMessageText:'Coloca tu teléfono en posición vertical.',
  portraitMessageText:'Mantén tu teléfono en posición vertical.',
  tryAgainText:'Volver',
};
export function mountDetector(container,{sessionId,credentials,onAnalysisComplete,onError,onCancel}){
 const root=createRoot(container);
 root.render(<FaceLivenessDetectorCore sessionId={sessionId} region="us-east-1" config={{credentialProvider:async()=>credentials}} displayText={displayText} onAnalysisComplete={onAnalysisComplete} onError={onError} onUserCancel={onCancel}/>);
 return ()=>root.unmount();
}
