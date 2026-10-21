// API pública del adaptador de almacenamiento del despliegue (S3, R2 o disco)
export {
  createDeploymentStorages, LocalOriginalsStorage, LocalPublishedStorage, R2PublishedStorage, S3OriginalsStorage,
  type BucketCredentials, type DeploymentStorageConfig, type R2Config, type S3Config,
} from './DeploymentStorages'
